import { loadConfig } from './config.js';
import { Store } from './store.js';
import { validSignature, randomToken, hash, cookie, browserCookie } from './security.js';
import { immediate, complete, message } from './interactions.js';
import { api, grant } from './discord.js';
import { isSetup } from './settings.js';

const headers = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
const text = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const redirect = (location, extra = {}) => text('Redirecting...', 302, { Location: location, ...extra });
const urlWith = (url, params) => `${url}?${new URLSearchParams(params)}`;
async function exchange(config, provider, code) {
  const discord = provider === 'discord';
  return api(discord ? 'https://discord.com/api/oauth2/token' : 'https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({
      client_id: discord ? config.DISCORD_CLIENT_ID : config.GOOGLE_CLIENT_ID,
      client_secret: discord ? config.DISCORD_CLIENT_SECRET : config.GOOGLE_CLIENT_SECRET,
      grant_type: 'authorization_code', code, redirect_uri: `${config.baseUrl}/oauth/${provider}`,
    }),
  }, provider);
}
async function interactions(request, env, ctx) {
  // Verify the exact raw body before parsing or executing any command.
  if (Number(request.headers.get('content-length')) > 65536) return text('Payload too large', 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 65536) return text('Payload too large', 413);
  if (!await validSignature(request, body, env.DISCORD_PUBLIC_KEY)) return text('Invalid request signature', 401);
  let interaction;
  try { interaction = JSON.parse(body); } catch { return text('Invalid JSON', 400); }
  // Endpoint registration PING works before other bot credentials are configured.
  if (interaction.type === 1) return json({ type: 1 });
  let config;
  const store = new Store(env.DB);
  try { config = loadConfig({ ...env, ...await store.settings() }, { setup: isSetup(interaction) }); } catch { return json(message('The bot configuration is incomplete. Administrators can use /tiktok setup, /youtube setup, and /getrole to set creator accounts and the access role. Check remaining credentials with npm run setup:check.')); }
  if (interaction.application_id !== config.DISCORD_CLIENT_ID || interaction.guild_id !== config.DISCORD_GUILD_ID || !interaction.member?.user?.id) return json(message('Use this bot in the configured Underscore server.'));
  if (!interaction.data || !/^\d{17,20}$/.test(interaction.id) || typeof interaction.token !== 'string') return text('Invalid interaction', 400);
  const response = immediate(interaction, config);
  if (response) return json(response);
  // Acknowledge within Discord's deadline; complete REST/D1 work in the background.
  ctx.waitUntil(complete(interaction, config, store));
  return json({ type: 5, data: { flags: 64 } });
}
async function oauth(request, env, url) {
  const store = new Store(env.DB), config = loadConfig({ ...env, ...await store.settings() });
  if (config.policy === 'tiktok') return text('YouTube verification is disabled.', 404);
  if (url.origin !== config.baseUrl) return text('Use the configured verification domain.', 400);
  if (url.pathname === '/start') {
    const session = await store.consume(url.searchParams.get('token'), 'start');
    if (!session) return text('Invalid or expired link. Use /verify again.', 400);
    const nonce = randomToken();
    const state = await store.session({ stage: 'discord', user: session.user, browser: await hash(nonce) });
    return redirect(urlWith('https://discord.com/oauth2/authorize', { client_id: config.DISCORD_CLIENT_ID, redirect_uri: `${config.baseUrl}/oauth/discord`, response_type: 'code', scope: 'identify', state }), { 'Set-Cookie': browserCookie(nonce, config.baseUrl) });
  }
  const provider = url.pathname === '/oauth/discord' ? 'discord' : 'google';
  const nonce = cookie(request);
  const session = await store.consume(url.searchParams.get('state'), provider, nonce ? await hash(nonce) : null);
  const code = url.searchParams.get('code');
  if (!session || !code || url.searchParams.has('error')) return text('Sign-in expired, canceled, or could not be tied to this browser. Use /verify again.', 400);
  const token = await exchange(config, provider, code);
  if (provider === 'discord') {
    const user = await api('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } }, 'discord');
    if (user.id !== session.user) return text('Wrong Discord account. Use /verify again and sign into the same Discord account.', 403);
    const state = await store.session({ stage: 'google', user: session.user, browser: session.browser });
    return redirect(urlWith('https://accounts.google.com/o/oauth2/v2/auth', { client_id: config.GOOGLE_CLIENT_ID, redirect_uri: `${config.baseUrl}/oauth/google`, response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.readonly', state, access_type: 'online', prompt: 'select_account' }));
  }
  const auth = { headers: { Authorization: `Bearer ${token.access_token}` } };
  const subscriptions = await api(urlWith('https://www.googleapis.com/youtube/v3/subscriptions', { part: 'id', mine: 'true', forChannelId: config.YOUTUBE_CHANNEL_ID, maxResults: '1' }), auth, 'google');
  if (!subscriptions.items?.length) return text('Subscription not found. Subscribe to our YouTube channel, then use /verify again.', 403);
  const channels = await api('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', auth, 'google');
  if (!channels.items?.[0]?.id) throw new Error('YouTube identity unavailable');
  await store.verify(session.user, 'youtube', channels.items[0].id, config.YOUTUBE_CHANNEL_ID);
  const granted = await grant(config, store, session.user);
  return text(granted ? 'YouTube subscription verified. Your Underscore access role has been granted. You can close this tab.' : 'YouTube verified. Complete TikTok review in Discord to meet the server requirement.', 200, { 'Set-Cookie': browserCookie('', config.baseUrl, true) });
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/interactions') {
        if (request.method !== 'POST') return text('Method not allowed', 405, { Allow: 'POST' });
        return await interactions(request, env, ctx);
      }
      if (request.method !== 'GET') return text('Method not allowed', 405, { Allow: 'GET' });
      if (url.pathname === '/') return text('Underscore Verification. Start with /verify in Discord. Google tokens are used only during verification and are not stored. Verification records and TikTok evidence URLs remain until removed by an administrator. Contact your server administrators for data removal.');
      if (url.pathname === '/health') {
        try { loadConfig({ ...env, ...await new Store(env.DB).settings() }); await env.DB.prepare('SELECT id FROM members LIMIT 1').first(); return json({ ready: true }); }
        catch { return json({ ready: false }, 503); }
      }
      if (['/start', '/oauth/discord', '/oauth/google'].includes(url.pathname)) return await oauth(request, env, url);
      return text('Not found', 404);
    } catch (error) {
      console.error('Verification request failed', error.name, error.status || '');
      return text('Verification could not finish. Retry /verify, or /verification-status if verification was saved. Ask an administrator to check credentials, account conflicts, and role permissions.', 502);
    }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(new Store(env.DB).cleanup()); },
};

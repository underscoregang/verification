import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import worker from '../src/index.js';
import { Store } from '../src/store.js';
import { loadConfig, configIssues, qualifies } from '../src/config.js';
import { hash, validateProof } from '../src/security.js';
import { immediate, perform } from '../src/interactions.js';
import { parseYoutube, resolveYoutube, configure } from '../src/settings.js';
import { grant } from '../src/discord.js';

let mf, db, store, keys, env;
const app = '100000000000000001', guild = '100000000000000002', role = '100000000000000003', channel = '100000000000000004';
const user = '100000000000000005', moderator = '100000000000000006';
let serial = 100;
const nextId = () => `10000000000000${++serial}`;
before(async () => {
  keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex');
  env = { DISCORD_TOKEN: 'test-token', DISCORD_CLIENT_ID: app, DISCORD_PUBLIC_KEY: publicKey, DISCORD_CLIENT_SECRET: 'test-secret', DISCORD_GUILD_ID: guild, VERIFIED_ROLE_ID: role, REVIEW_CHANNEL_ID: channel, GOOGLE_CLIENT_ID: 'test-google', GOOGLE_CLIENT_SECRET: 'test-google-secret', YOUTUBE_CHANNEL_ID: `UC${'a'.repeat(22)}`, TIKTOK_USERNAME: 'underscore', VERIFICATION_POLICY: 'either', PUBLIC_URL: 'https://verification.example.com' };
  const modules = ['index', 'config', 'store', 'security', 'discord', 'interactions', 'settings'].map(name => ({ type: 'ESModule', path: fileURLToPath(new URL(`../src/${name}.js`, import.meta.url)) }));
  mf = new Miniflare(convertV4MiniflareOptions({ modules, compatibilityDate: '2026-10-12', d1Databases: ['DB'], bindings: env }));
  db = await mf.getD1Database('DB');
  // D1 exec expects one complete statement per line.
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  env.DB = db;
  store = new Store(db);
});
after(async () => { mock.restoreAll(); await mf?.dispose(); });
async function signed(payload, timestamp = String(Math.floor(Date.now() / 1000))) {
  const body = JSON.stringify(payload);
  const signature = Buffer.from(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(timestamp + body))).toString('hex');
  return new Request(`${env.PUBLIC_URL}/interactions`, { method: 'POST', body, headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp } });
}
function interaction(type, data, extra = {}) {
  return { id: nextId(), application_id: app, guild_id: guild, channel_id: channel, token: 'interaction-test-token', type, data, member: { user: { id: user }, permissions: '0' }, ...extra };
}
async function call(request, bindings = env) {
  const tasks = [];
  const response = await worker.fetch(request, bindings, { waitUntil: promise => tasks.push(promise) });
  await Promise.all(tasks);
  return response;
}
function providers({ subscribed = true, discordUser = user, grantFails = false } = {}) {
  const calls = [];
  const mocked = mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input), path = url.pathname;
    calls.push({ url: url.href, method: options.method || 'GET', body: options.body });
    let body;
    if (path.endsWith('/oauth2/token') || url.hostname === 'oauth2.googleapis.com') body = { access_token: 'temporary-provider-token' };
    else if (path.endsWith('/users/@me')) body = { id: discordUser };
    else if (path === '/youtube/v3/subscriptions') body = { items: subscribed ? [{ id: 'subscription' }] : [] };
    else if (path === '/youtube/v3/channels') body = { items: [{ id: 'UC_member_identity' }] };
    else if (path === `/api/v10/guilds/${guild}/roles`) body = [{ id: role, managed: false, permissions: '0' }];
    else if (path.endsWith(`/roles/${role}`) && options.method === 'PUT') return new Response(null, { status: grantFails ? 403 : 204 });
    else if (path === `/api/v10/channels/${channel}`) body = { id: channel, guild_id: guild, type: 0 };
    else if (path === `/api/v10/channels/${channel}/messages`) body = { id: '100000000000000009' };
    else if (options.method === 'PATCH') body = { id: 'message' };
    else throw new Error(`Unexpected provider path: ${path}`);
    return Response.json(body);
  });
  return { calls, restore: () => mocked.mock.restore() };
}

test('verification policies enforce all combinations', () => {
  for (const youtube of [false, true]) for (const tiktok of [false, true]) {
    assert.equal(qualifies('both', { youtube, tiktok }), youtube && tiktok);
    assert.equal(qualifies('either', { youtube, tiktok }), youtube || tiktok);
    assert.equal(qualifies('youtube', { youtube, tiktok }), youtube);
    assert.equal(qualifies('tiktok', { youtube, tiktok }), tiktok);
  }
  assert.equal(qualifies('either'), false);
  assert.equal(qualifies('invalid', { youtube: true }), false);
});
test('configuration rejects incomplete settings, insecure origins, and malformed IDs', () => {
  assert.ok(configIssues({}).some(issue => issue.includes('DISCORD_PUBLIC_KEY')));
  assert.throws(() => loadConfig({ ...env, PUBLIC_URL: 'http://example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...env, PUBLIC_URL: 'https://example.com/path' }), /origin/);
  assert.throws(() => loadConfig({ ...env, DISCORD_GUILD_ID: 'bad' }), /Discord ID/);
  assert.equal(loadConfig(env).policy, 'either');
});
test('real Worker runtime rejects unsigned requests and answers signed Discord PING', async () => {
  const denied = await mf.dispatchFetch(`${env.PUBLIC_URL}/interactions`, { method: 'POST', body: '{"type":1}' });
  assert.equal(denied.status, 401);
  const request = await signed({ type: 1 });
  const response = await mf.dispatchFetch(request.url, { method: 'POST', headers: Object.fromEntries(request.headers), body: await request.text() });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: 1 });
});
test('tampered and stale signed interactions cannot execute', async () => {
  const request = await signed({ type: 1 });
  const tampered = new Request(request.url, { method: 'POST', headers: request.headers, body: '{"type":2}' });
  assert.equal((await call(tampered)).status, 401);
  assert.equal((await call(await signed({ type: 1 }, String(Math.floor(Date.now() / 1000) - 600)))).status, 401);
});
test('commands deny other servers and panel requires Manage Server', async () => {
  const wrong = await call(await signed(interaction(2, { name: 'verify' }, { guild_id: '100000000000000099' })));
  assert.match((await wrong.json()).data.content, /configured Underscore/);
  const denied = await call(await signed(interaction(2, { name: 'verification-panel' })));
  assert.equal((await denied.json()).data.flags, 64);
  const panel = await call(await signed(interaction(2, { name: 'verification-panel' }, { member: { user: { id: user }, permissions: '32' } })));
  const payload = await panel.json();
  assert.equal(payload.data.flags, 0);
  assert.equal(payload.data.components[0].components.length, 2);
});
test('TikTok modal opens immediately; disabled platform buttons are denied', () => {
  const config = loadConfig(env);
  assert.equal(immediate(interaction(3, { custom_id: 'tiktok' }), config).type, 9);
  assert.match(immediate(interaction(3, { custom_id: 'tiktok' }), { ...config, policy: 'youtube' }).data.content, /unavailable/);
});
test('D1 OAuth sessions bind browser and stage, expire, and are atomically single-use', async () => {
  const token = await store.session({ user, stage: 'google', browser: 'browser-hash' });
  assert.equal(await store.consume(token, 'discord', 'browser-hash'), null);
  assert.equal(await store.consume(token, 'google', 'wrong'), null);
  assert.equal(await store.consume(token, 'google'), null);
  const results = await Promise.all([store.consume(token, 'google', 'browser-hash'), store.consume(token, 'google', 'browser-hash')]);
  assert.equal(results.filter(Boolean).length, 1);
  const expired = await store.session({ user, stage: 'start' });
  await db.prepare('UPDATE sessions SET expires=0 WHERE hash=?').bind(await hash(expired)).run();
  assert.equal(await store.consume(expired, 'start'), null);
});
test('YouTube interaction defers privately and replay cannot create extra sessions', async () => {
  const provider = providers();
  try {
    const payload = interaction(3, { custom_id: 'youtube' });
    const first = await call(await signed(payload));
    assert.deepEqual(await first.json(), { type: 5, data: { flags: 64 } });
    assert.match(JSON.parse(provider.calls[0].body).components[0].components[0].url, /\/start\?token=/);
    await call(await signed(payload));
    assert.equal(provider.calls.length, 1);
  } finally { provider.restore(); }
});
test('OAuth browser binding rejects missing cookie and wrong Discord identity', async () => {
  const token = await store.session({ user, stage: 'start' });
  const start = await call(new Request(`${env.PUBLIC_URL}/start?token=${token}`));
  assert.equal(start.status, 302);
  assert.match(start.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  assert.equal((await call(new Request(`${env.PUBLIC_URL}/oauth/discord?code=test&state=${state}`))).status, 400);
  const provider = providers({ discordUser: moderator });
  try {
    const result = await call(new Request(`${env.PUBLIC_URL}/oauth/discord?code=test&state=${state}`, { headers: { cookie: start.headers.get('set-cookie').split(';')[0] } }));
    assert.equal(result.status, 403);
    assert.equal(provider.calls.length, 2);
  } finally { provider.restore(); }
});
async function googleSession() {
  const nonce = 'browser-nonce';
  return { state: await store.session({ user, stage: 'google', browser: await hash(nonce) }), headers: { cookie: `underscore_oauth=${nonce}` } };
}
test('correct Discord login advances to Google with the same member and browser binding', async () => {
  const provider = providers();
  try {
    const token = await store.session({ user, stage: 'start' });
    const start = await call(new Request(`${env.PUBLIC_URL}/start?token=${token}`));
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const browserCookie = start.headers.get('set-cookie').split(';')[0];
    const response = await call(new Request(`${env.PUBLIC_URL}/oauth/discord?state=${state}&code=test`, { headers: { cookie: browserCookie } }));
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.hostname, 'accounts.google.com');
    const google = await store.consume(location.searchParams.get('state'), 'google', await hash(browserCookie.slice('underscore_oauth='.length)));
    assert.equal(google.user, user);
  } finally { provider.restore(); }
});
test('missing YouTube subscription never verifies or grants a role', async () => {
  const session = await googleSession(), provider = providers({ subscribed: false });
  try {
    const result = await call(new Request(`${env.PUBLIC_URL}/oauth/google?code=test&state=${session.state}`, { headers: session.headers }));
    assert.equal(result.status, 403);
    assert.equal(await store.member(user), null);
    assert.equal(provider.calls.some(call => call.method === 'PUT'), false);
  } finally { provider.restore(); }
});
test('successful YouTube subscription grants role and OAuth replay is denied', async () => {
  const session = await googleSession(), provider = providers();
  try {
    const url = `${env.PUBLIC_URL}/oauth/google?code=test&state=${session.state}`;
    const result = await call(new Request(url, { headers: session.headers }));
    assert.equal(result.status, 200);
    assert.equal((await store.member(user)).youtube, 'UC_member_identity');
    assert.equal(provider.calls.filter(call => call.method === 'PUT').length, 1);
    assert.equal((await call(new Request(url, { headers: session.headers }))).status, 400);
  } finally { provider.restore(); }
});
test('both policy holds role until TikTok approval; failed grants preserve verification', async () => {
  const session = await googleSession(), provider = providers({ grantFails: true });
  try {
    const url = `${env.PUBLIC_URL}/oauth/google?code=test&state=${session.state}`;
    const result = await call(new Request(url, { headers: session.headers }), { ...env, VERIFICATION_POLICY: 'both' });
    assert.equal(result.status, 200);
    assert.match(await result.text(), /Complete TikTok/);
    assert.equal(provider.calls.some(call => call.method === 'PUT'), false);
    const next = await googleSession();
    assert.equal((await call(new Request(`${env.PUBLIC_URL}/oauth/google?code=test&state=${next.state}`, { headers: next.headers }))).status, 502);
    assert.equal((await store.member(user)).youtube, 'UC_member_identity');
  } finally { provider.restore(); }
});
test('social accounts cannot verify multiple Discord members', async () => {
  await assert.rejects(store.verify(moderator, 'youtube', 'UC_member_identity'));
  assert.equal(await store.member(moderator), null);
});
test('TikTok evidence validation requires HTTPS and safe usernames', () => {
  assert.equal(validateProof('user', 'http://example.com/proof'), undefined);
  assert.equal(validateProof('user', 'https://secret@example.com/proof'), undefined);
  assert.equal(validateProof('user', 'https://example.com/> fake'), undefined);
  assert.equal(validateProof('@user', 'https://example.com/proof'), undefined);
  assert.equal(validateProof('Member', 'https://example.com/proof').handle, 'member');
});
test('TikTok submission sends review and duplicate pending submission is blocked', async () => {
  const provider = providers();
  try {
    const payload = interaction(5, { custom_id: 'tiktok-proof', components: [{ components: [{ custom_id: 'handle', value: 'test_member' }, { custom_id: 'proof', value: 'https://example.com/proof' }] }] });
    const result = await perform(payload, loadConfig(env), store);
    assert.match(result.content, /Evidence submitted/);
    assert.equal((await store.review(payload.id)).message_id, '100000000000000009');
    const duplicate = await perform({ ...payload, id: nextId() }, loadConfig(env), store);
    assert.match(duplicate.content, /pending review/);
    assert.equal(provider.calls.filter(call => call.method === 'POST').length, 1);
  } finally { provider.restore(); }
});
test('review permission and self-review checks cannot grant approval', async () => {
  const config = loadConfig(env);
  const denial = immediate(interaction(3, { custom_id: 'approve:100000000000000101' }), config);
  assert.match(denial.data.content, /Manage Roles/);
  const id = nextId();
  await store.createReview(id, moderator, 'self_member', 'https://example.com/proof');
  await store.attachReview(id, 'original');
  const self = await perform(interaction(3, { custom_id: `approve:${id}` }, { member: { user: { id: moderator }, permissions: '268435456' }, message: { id: 'original' } }), config, store);
  assert.match(self.content, /another moderator/);
  assert.equal((await store.review(id)).status, 'pending');
});
test('concurrent moderator decisions produce one winner and atomic member state', async () => {
  const id = nextId(), target = nextId();
  await store.createReview(id, target, 'concurrent_member', 'https://example.com/proof');
  const results = await Promise.all([store.decideReview(id, moderator, true, nextId()), store.decideReview(id, user, false, nextId())]);
  assert.equal(results.filter(Boolean).length, 1);
  const review = await store.review(id), member = await store.member(target);
  assert.equal(Boolean(member?.tiktok), review.status === 'approved');
});
test('approved TikTok review grants the role and a second click cannot change the decision', async () => {
  const provider = providers();
  try {
    const id = nextId(), target = nextId();
    await store.createReview(id, target, 'approved_member', 'https://example.com/proof');
    await store.attachReview(id, 'original-message');
    const payload = interaction(3, { custom_id: `approve:${id}` }, { member: { user: { id: moderator }, permissions: '268435456' }, message: { id: 'original-message' } });
    const approved = await perform(payload, loadConfig(env), store);
    assert.match(approved.content, /Access role granted/);
    assert.equal((await store.member(target)).tiktok, 'approved_member');
    assert.equal(provider.calls.filter(call => call.method === 'PUT').length, 1);
    const duplicate = await perform({ ...payload, id: nextId() }, loadConfig(env), store);
    assert.match(duplicate.content, /already been handled/);
    assert.equal(provider.calls.filter(call => call.method === 'PUT').length, 1);
  } finally { provider.restore(); }
});
test('duplicate TikTok identity rolls back approval and preserves pending review', async () => {
  await store.verify(nextId(), 'tiktok', 'claimed_member');
  const id = nextId(), target = nextId();
  await store.createReview(id, target, 'claimed_member', 'https://example.com/proof');
  await assert.rejects(store.decideReview(id, moderator, true, nextId()));
  assert.equal((await store.review(id)).status, 'pending');
  assert.equal(await store.member(target), null);
});
test('health checks configuration and migrated D1; unknown routes return 404', async () => {
  assert.equal((await call(new Request(`${env.PUBLIC_URL}/health`))).status, 200);
  assert.equal((await call(new Request(`${env.PUBLIC_URL}/health`), {})).status, 503);
  assert.equal((await call(new Request(`${env.PUBLIC_URL}/missing`))).status, 404);
});

const setupInteraction = (name, value, permissions = '32') => interaction(2, {
  name,
  options: name === 'getrole' ? [{ name: 'role', type: 3, value }] : [{ name: 'setup', type: 1, options: [{ name: name === 'tiktok' ? 'username' : 'channel', type: 3, value }] }],
}, { member: { user: { id: moderator }, permissions, roles: ['100000000000000008'] } });
function setupProviders({ rolePermissions = '0', botPosition = 10, memberPosition = 20, managed = false, lookup = [] } = {}) {
  const calls = [];
  const mocked = mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input), path = url.pathname;
    calls.push({ url, options });
    if (url.hostname === 'www.googleapis.com') return Response.json({ items: lookup.length ? lookup.shift() : [] });
    if (path.endsWith('/roles')) return Response.json([
      { id: guild, permissions: '0', position: 0 },
      { id: role, permissions: rolePermissions, managed, position: 2 },
      { id: '100000000000000007', permissions: '268435456', position: botPosition },
      { id: '100000000000000008', permissions: '32', position: memberPosition },
    ]);
    if (path.endsWith(`/members/${app}`)) return Response.json({ roles: ['100000000000000007'] });
    if (path === `/api/v10/guilds/${guild}`) return Response.json({ owner_id: '100000000000000099' });
    if (options.method === 'PATCH') return Response.json({ id: 'response' });
    throw new Error('Unexpected setup API call');
  });
  return { calls, restore: () => mocked.mock.restore() };
}
test('configuration commands enforce permissions even when perform is called directly', async () => {
  for (const [name, value] of [['tiktok', 'creator'], ['youtube', env.YOUTUBE_CHANNEL_ID], ['getrole', role]]) {
    const payload = setupInteraction(name, value, '0');
    assert.match(immediate(payload, loadConfig(env)).data.content, /permission is required/);
    assert.match((await perform(payload, loadConfig(env), store)).content, /permission is required/);
  }
  assert.deepEqual(await store.settings(), {});
});
test('YouTube setup accepts handles, usernames, IDs, and trusted channel URLs', () => {
  assert.deepEqual(parseYoutube('@underscore'), { handle: '@underscore' });
  assert.deepEqual(parseYoutube('underscore'), { handle: '@underscore', username: 'underscore' });
  assert.deepEqual(parseYoutube(env.YOUTUBE_CHANNEL_ID), { id: env.YOUTUBE_CHANNEL_ID });
  assert.deepEqual(parseYoutube('https://www.youtube.com/@underscore'), { handle: '@underscore' });
  assert.deepEqual(parseYoutube(`https://www.youtube.com/channel/${env.YOUTUBE_CHANNEL_ID}`), { id: env.YOUTUBE_CHANNEL_ID });
  assert.deepEqual(parseYoutube('https://youtube.com/user/LegacyName'), { username: 'LegacyName' });
  assert.equal(parseYoutube('https://youtube.com.evil.example/@underscore'), undefined);
  assert.equal(parseYoutube('https://youtube.com/watch?v=123'), undefined);
  assert.equal(parseYoutube('https://youtube.com/@%ZZ'), undefined);
});
test('YouTube lookup uses exact API handle lookup and falls back to legacy username', async () => {
  const provider = setupProviders({ lookup: [[], [{ id: env.YOUTUBE_CHANNEL_ID }]] });
  try {
    const resolved = await resolveYoutube({ ...env, YOUTUBE_API_KEY: 'test-api-key' }, 'legacy');
    assert.deepEqual(resolved, { id: env.YOUTUBE_CHANNEL_ID });
    assert.equal(provider.calls[0].url.searchParams.get('forHandle'), '@legacy');
    assert.equal(provider.calls[1].url.searchParams.get('forUsername'), 'legacy');
    assert.equal(provider.calls[0].url.searchParams.get('key'), 'test-api-key');
    const missing = await resolveYoutube(env, '@creator');
    assert.match(missing.error, /YOUTUBE_API_KEY/);
    assert.equal(provider.calls.length, 2);
    assert.deepEqual(await resolveYoutube(env, env.YOUTUBE_CHANNEL_ID), { id: env.YOUTUBE_CHANNEL_ID });
  } finally { provider.restore(); }
});
test('TikTok setup bootstraps with missing targets and persists the normalized username', async () => {
  const provider = setupProviders();
  try {
    const incomplete = { ...env, VERIFIED_ROLE_ID: '', YOUTUBE_CHANNEL_ID: '', TIKTOK_USERNAME: '', REVIEW_CHANNEL_ID: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
    const response = await call(await signed(setupInteraction('tiktok', '@New_Creator')), incomplete);
    assert.deepEqual(await response.json(), { type: 5, data: { flags: 64 } });
    assert.equal((await new Store(db).settings()).TIKTOK_USERNAME, 'new_creator');
    assert.equal((await store.member(user)).tiktok, null);
    const invalid = await configure(setupInteraction('tiktok', 'bad user'), loadConfig(env), store);
    assert.match(invalid.content, /Enter a TikTok username/);
    assert.equal((await store.settings()).TIKTOK_USERNAME, 'new_creator');
  } finally { provider.restore(); }
});
test('YouTube setup persists channel ID, clears old proofs and sessions, and overrides env defaults', async () => {
  const newChannel = `UC${'b'.repeat(22)}`;
  const token = await store.session({ user, stage: 'start' });
  const result = await configure(setupInteraction('youtube', newChannel), loadConfig(env), store);
  assert.match(result.content, /YouTube target saved/);
  const config = loadConfig({ ...env, ...await new Store(db).settings() });
  assert.equal(config.YOUTUBE_CHANNEL_ID, newChannel);
  assert.equal((await store.member(user)).youtube, null);
  assert.equal(await store.consume(token, 'start'), null);
  await store.verify(user, 'youtube', 'stale_identity', env.YOUTUBE_CHANNEL_ID);
  assert.equal(await grant(config, store, user), false);
});
test('getrole accepts mentions and IDs and persists the access role', async () => {
  const provider = setupProviders();
  try {
    for (const value of [`<@&${role}>`, role]) {
      const result = await configure(setupInteraction('getrole', value, '268435456'), loadConfig(env), store);
      assert.match(result.content, /Verification access role saved/);
      assert.equal((await store.settings()).VERIFIED_ROLE_ID, role);
    }
    const bad = await configure(setupInteraction('getrole', '@not-a-mention', '268435456'), loadConfig(env), store);
    assert.match(bad.content, /numeric role ID/);
  } finally { provider.restore(); }
});
test('getrole rejects privileged, managed, and unmanageable roles', async () => {
  for (const [options, expected] of [
    [{ rolePermissions: '8' }, /without Administrator/],
    [{ rolePermissions: '268435456' }, /without Administrator/],
    [{ managed: true }, /normal access role/],
    [{ botPosition: 1 }, /move its highest role/],
    [{ memberPosition: 1 }, /below your own highest role/],
  ]) {
    const provider = setupProviders(options);
    try {
      const result = await configure(setupInteraction('getrole', role, '268435456'), loadConfig(env), store);
      assert.match(result.content, expected);
    } finally { provider.restore(); }
  }
});
test('saving the same creator keeps valid proofs and setup cannot write arbitrary settings', async () => {
  const creator = (await store.settings()).TIKTOK_USERNAME;
  await store.verify(user, 'tiktok', 'retained_identity', creator);
  await store.saveSetting('TIKTOK_USERNAME', creator, moderator, creator);
  assert.equal((await store.member(user)).tiktok, 'retained_identity');
  await assert.rejects(store.saveSetting('DISCORD_TOKEN', 'bad', moderator, 'old'));
});

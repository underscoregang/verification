import { api, discord } from './discord.js';
import { hasPermission } from './security.js';
export const isSetup = i => i.type === 2 && ['tiktok', 'youtube', 'getrole'].includes(i.data?.name);
export function setupPermission(i) {
  return hasPermission(i.member?.permissions, i.data.name === 'getrole' ? 268435456n : 32n);
}
export function parseYoutube(value) {
  if (typeof value !== 'string') return;
  value = value.trim();
  if (/^UC[\w-]{22}$/.test(value)) return { id: value };
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) || url.username || url.password) return;
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] === 'channel' && parts.length === 2 && /^UC[\w-]{22}$/.test(parts[1])) return { id: parts[1] };
      if (parts[0] === 'user' && parts.length === 2 && /^[a-z0-9._-]{1,100}$/i.test(parts[1])) return { username: parts[1] };
      if (parts.length === 1 && parts[0].startsWith('@')) value = parts[0];
      else return;
    } catch { return; }
  }
  if (/^@[^\s/@<>?#]{1,100}$/u.test(value)) return { handle: value };
  if (/^[a-z0-9._-]{1,100}$/i.test(value)) return { handle: `@${value}`, username: value };
}
export async function resolveYoutube(config, input) {
  const parsed = parseYoutube(input);
  if (!parsed) return { error: 'Enter a YouTube @handle, username, UC... channel ID, or youtube.com channel URL.' };
  if (parsed.id) return parsed;
  if (!config.YOUTUBE_API_KEY) return { error: 'Username lookup needs YOUTUBE_API_KEY in the Worker secrets. Ask the bot owner to add a YouTube Data API v3 API key, or enter the UC... channel ID directly.' };
  try {
    for (const [key, value] of [['forHandle', parsed.handle], ['forUsername', parsed.username]]) {
      if (!value) continue;
      const params = new URLSearchParams({ part: 'id', [key]: value, key: config.YOUTUBE_API_KEY });
      const result = await api(`https://www.googleapis.com/youtube/v3/channels?${params}`, {}, 'google');
      if (/^UC[\w-]{22}$/.test(result.items?.[0]?.id || '')) return { id: result.items[0].id };
    }
    return { error: 'YouTube channel not found. Check the @handle or use a UC... channel ID.' };
  } catch { return { error: 'YouTube lookup failed. Check YOUTUBE_API_KEY, YouTube Data API v3 activation, and API quota, or use a UC... channel ID.' }; }
}
async function validateRole(config, interaction, id) {
  const [roles, bot, guild] = await Promise.all([
    discord(config, `/guilds/${config.DISCORD_GUILD_ID}/roles`),
    discord(config, `/guilds/${config.DISCORD_GUILD_ID}/members/${config.DISCORD_CLIENT_ID}`),
    discord(config, `/guilds/${config.DISCORD_GUILD_ID}`),
  ]);
  const role = roles.find(item => item.id === id);
  if (!role) return 'That role does not exist in this server.';
  if (role.id === config.DISCORD_GUILD_ID || role.managed) return 'Choose a normal access role, not @everyone or an integration-managed role.';
  // Access verification must never award server administration permissions.
  if ((BigInt(role.permissions) & (8n | 32n | 268435456n)) !== 0n) return 'Choose an access role without Administrator, Manage Server, or Manage Roles permissions.';
  const highest = ids => Math.max(0, ...roles.filter(item => ids.includes(item.id)).map(item => item.position));
  const botPermissions = roles.filter(item => bot.roles.includes(item.id) || item.id === config.DISCORD_GUILD_ID).reduce((bits, item) => bits | BigInt(item.permissions), 0n);
  if (!hasPermission(botPermissions.toString(), 268435456n) || highest(bot.roles) <= role.position) return 'Give the bot Manage Roles and move its highest role above the selected role.';
  if (guild.owner_id !== interaction.member.user.id && highest(interaction.member.roles || []) <= role.position) return 'Choose a role below your own highest role.';
}
export async function configure(interaction, config, store) {
  if (!setupPermission(interaction)) return { content: interaction.data.name === 'getrole' ? 'Manage Roles permission is required.' : 'Manage Server permission is required.' };
  const { name, options = [] } = interaction.data;
  const actor = interaction.member.user.id;
  if (name === 'getrole') {
    const raw = options.find(option => option.name === 'role')?.value;
    const id = typeof raw === 'string' && raw.trim().match(/^(?:<@&(\d{17,20})>|(\d{17,20}))$/)?.slice(1).find(Boolean);
    if (!id) return { content: 'Enter a role mention such as @Verified or a numeric role ID.' };
    const error = await validateRole(config, interaction, id);
    if (error) return { content: error };
    await store.saveSetting('VERIFIED_ROLE_ID', id, actor, config.VERIFIED_ROLE_ID);
    return { content: `Verification access role saved: <@&${id}>. Members receive this role only after satisfying the verification policy. Existing roles are not removed.` };
  }
  const subcommand = options.find(option => option.name === 'setup' && option.type === 1);
  if (!subcommand) return { content: `Use /${name} setup to configure the creator account.` };
  if (name === 'tiktok') {
    const raw = subcommand.options?.find(option => option.name === 'username')?.value;
    const username = typeof raw === 'string' ? raw.trim().replace(/^@/, '').toLowerCase() : '';
    if (!/^[a-z0-9._]{2,24}$/.test(username)) return { content: 'Enter a TikTok username with 2–24 letters, numbers, dots, or underscores, with or without @.' };
    await store.saveSetting('TIKTOK_USERNAME', username, actor, config.TIKTOK_USERNAME);
    return { content: `TikTok target saved: @${username}. TikTok still requires moderator review. If the target changed, saved TikTok verification and pending reviews were reset; existing Discord roles are not removed.` };
  }
  const result = await resolveYoutube(config, subcommand.options?.find(option => option.name === 'channel')?.value);
  if (result.error) return { content: result.error };
  await store.saveSetting('YOUTUBE_CHANNEL_ID', result.id, actor, config.YOUTUBE_CHANNEL_ID);
  return { content: `YouTube target saved: https://www.youtube.com/channel/${result.id}. If the target changed, saved YouTube verification was reset; existing Discord roles are not removed.` };
}

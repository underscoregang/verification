import { qualifies } from './config.js';
export class ProviderError extends Error {
  constructor(provider, status) { super(`${provider} request failed`); this.name = 'ProviderError'; this.provider = provider; this.status = status; }
}
export async function api(url, options = {}, provider = 'provider') {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new ProviderError(provider, response.status);
  if (response.status === 204) return null;
  return response.json();
}
export function discord(config, path, method = 'GET', body) {
  return api(`https://discord.com/api/v10${path}`, {
    method, headers: { Authorization: `Bot ${config.DISCORD_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, 'discord');
}
export async function grant(config, store, user) {
  config = { ...config, ...await store.settings() };
  const record = await store.member(user);
  if (!qualifies(config.policy, {
    youtube: record?.youtube && (!record.youtube_target || record.youtube_target === config.YOUTUBE_CHANNEL_ID),
    tiktok: record?.tiktok && (!record.tiktok_target || record.tiktok_target === config.TIKTOK_USERNAME),
  })) return false;
  const roles = await discord(config, `/guilds/${config.DISCORD_GUILD_ID}/roles`);
  const role = roles.find(role => role.id === config.VERIFIED_ROLE_ID);
  if (!role || role.managed || role.id === config.DISCORD_GUILD_ID || (BigInt(role.permissions) & 8n) !== 0n) throw new Error('Invalid verified role');
  // Discord enforces Manage Roles and bot role hierarchy on this endpoint.
  await discord(config, `/guilds/${config.DISCORD_GUILD_ID}/members/${user}/roles/${role.id}`, 'PUT');
  return true;
}
export async function editResponse(config, interaction, body) {
  // Interaction webhook tokens authorize only this response; no bot header needed.
  return api(`https://discord.com/api/v10/webhooks/${config.DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body }),
  }, 'discord');
}

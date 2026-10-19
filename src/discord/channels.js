import { discord } from "./client.js";
import { hasPermission } from "../shared/security.js";

export async function checkChannels(config, requests) {
  const [roles, bot, ...channels] = await Promise.all([
    discord(config, `/guilds/${config.DISCORD_GUILD_ID}/roles`),
    discord(
      config,
      `/guilds/${config.DISCORD_GUILD_ID}/members/${config.DISCORD_CLIENT_ID}`,
    ),
    ...requests.map(({ id }) => discord(config, `/channels/${id}`)),
  ]);
  const base = roles
    .filter(
      (role) =>
        role.id === config.DISCORD_GUILD_ID || bot.roles.includes(role.id),
    )
    .reduce((bits, role) => bits | BigInt(role.permissions), 0n);
  for (let index = 0; index < channels.length; index++) {
    const channel = channels[index],
      request = requests[index];
    if (
      channel.guild_id !== config.DISCORD_GUILD_ID ||
      ![0, 5].includes(channel.type)
    )
      return "Choose a text channel in this server.";
    if (request.private) {
      const everyone = roles.find(role => role.id === config.DISCORD_GUILD_ID);
      const overwrite = (channel.permission_overwrites || []).find(item => item.id === config.DISCORD_GUILD_ID);
      let visible = BigInt(everyone?.permissions || '0');
      if (overwrite) visible = (visible & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow);
      if ((visible & (1024n | 8n)) !== 0n) return `Make <#${channel.id}> private by denying View Channel for @everyone, then allow your staff roles and the bot. Or choose an existing private staff channel.`;
    }
    let permissions = base;
    if (!hasPermission(base.toString(), 8n)) {
      const overwrites = channel.permission_overwrites || [];
      const everyone = overwrites.find(
        (item) => item.id === config.DISCORD_GUILD_ID,
      );
      if (everyone)
        permissions =
          (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
      const roleOverwrites = overwrites.filter(
        (item) => item.type === 0 && bot.roles.includes(item.id),
      );
      const deny = roleOverwrites.reduce(
        (bits, item) => bits | BigInt(item.deny),
        0n,
      );
      const allow = roleOverwrites.reduce(
        (bits, item) => bits | BigInt(item.allow),
        0n,
      );
      permissions = (permissions & ~deny) | allow;
      const member = overwrites.find(
        (item) => item.type === 1 && item.id === config.DISCORD_CLIENT_ID,
      );
      if (member)
        permissions =
          (permissions & ~BigInt(member.deny)) | BigInt(member.allow);
      if ((permissions & request.permissions) !== request.permissions)
        return `The bot needs ${request.label} in <#${channel.id}>. Update channel permissions and retry.`;
    }
  }
  return null;
}

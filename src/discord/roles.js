import { qualifies } from "../config/runtime.js";
import { discord } from "./client.js";

export async function grant(config, store, user) {
  config = { ...config, ...(await store.settings()) };
  const record = await store.member(user);
  if (
    !qualifies(config.policy, {
      youtube:
        record?.youtube &&
        (!record.youtube_target ||
          record.youtube_target === config.YOUTUBE_CHANNEL_ID),
      tiktok:
        record?.tiktok &&
        (!record.tiktok_target ||
          record.tiktok_target === config.TIKTOK_USERNAME),
    })
  )
    return false;
  const roles = await discord(
    config,
    `/guilds/${config.DISCORD_GUILD_ID}/roles`,
  );
  const role = roles.find((role) => role.id === config.VERIFIED_ROLE_ID);
  if (
    !role ||
    role.managed ||
    role.id === config.DISCORD_GUILD_ID ||
    (BigInt(role.permissions) & 8n) !== 0n
  )
    throw new Error("Invalid verified role");
  // Discord enforces Manage Roles and bot role hierarchy on this endpoint.
  await discord(
    config,
    `/guilds/${config.DISCORD_GUILD_ID}/members/${user}/roles/${role.id}`,
    "PUT",
  );
  return true;
}

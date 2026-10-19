import { withStore } from "../database/connection.js";
import { discord } from "./client.js";

export const logColors = { success: 0x22c55e, warning: 0xf59e0b, danger: 0xef4444 };

// Posts an embed to the log channel saved with /channel logs; skipped until one is set.
export async function sendLog(env, embed, openStore = withStore) {
  const { LOG_CHANNEL_ID } = await openStore(env, (store) => store.settings());
  if (!LOG_CHANNEL_ID) return false;
  await discord(env, `/channels/${LOG_CHANNEL_ID}/messages`, "POST", {
    embeds: [{ timestamp: new Date().toISOString(), ...embed }],
    allowed_mentions: { parse: [] },
  });
  return true;
}

export const guildFields = (guild) => [
  { name: "Server", value: guild.name || "Unknown", inline: true },
  { name: "Server ID", value: `\`${guild.id}\``, inline: true },
  { name: "Members", value: String(guild.member_count ?? "Unknown"), inline: true },
  {
    name: "Owner",
    value: guild.owner_id ? `<@${guild.owner_id}> (\`${guild.owner_id}\`)` : "Unknown",
    inline: true,
  },
];

import { withStore } from "../database/connection.js";
import { discord } from "./client.js";
import { logCard } from "../components/cards.js";

// Posts a log card to the channel saved with /channel logs; skipped until one is set.
// entry: { tone: 'success' | 'warning' | 'danger', title, description?, fields? }
export async function sendLog(env, entry, openStore = withStore) {
  const { LOG_CHANNEL_ID } = await openStore(env, (store) => store.settings());
  if (!LOG_CHANNEL_ID) return false;
  await discord(env, `/channels/${LOG_CHANNEL_ID}/messages`, "POST", logCard(entry));
  return true;
}

export const guildFields = (guild) => [
  { name: "Server", value: guild.name || "Unknown" },
  { name: "Server ID", value: `\`${guild.id}\`` },
  { name: "Members", value: String(guild.member_count ?? "Unknown") },
  {
    name: "Owner",
    value: guild.owner_id ? `<@${guild.owner_id}> (\`${guild.owner_id}\`)` : "Unknown",
  },
];

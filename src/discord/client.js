import { api } from "../http/client.js";

export function discord(config, path, method = "GET", body) {
  return api(
    `https://discord.com/api/v10${path}`,
    {
      method,
      headers: {
        Authorization: `Bot ${config.DISCORD_TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    "discord",
  );
}
export async function editResponse(config, interaction, body) {
  // Interaction webhook tokens authorize only this response; no bot header needed.
  return api(
    `https://discord.com/api/v10/webhooks/${config.DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body }),
    },
    "discord",
  );
}

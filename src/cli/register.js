import { commands } from "../commands/index.js";
import { localEnv } from "../config/local-env.js";
const env = localEnv();
for (const key of ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"])
  if (!env[key]?.trim()) {
    console.error(`Missing ${key} in .env`);
    process.exit(1);
  }
try {
  const response = await fetch(
    `https://discord.com/api/v10/applications/${env.DISCORD_CLIENT_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) {
    console.error(
      `Command registration failed (HTTP ${response.status}). Check the bot token, IDs, and server installation.`,
    );
    process.exit(1);
  }
  console.log(
    "Registered Underscore verification commands in your configured Discord server.",
  );
} catch {
  console.error("Could not reach Discord. Check your connection and retry.");
  process.exit(1);
}

import { sendLog, logColors, guildFields } from "../../discord/logs.js";

// guild merges the GUILD_DELETE payload with details cached at GUILD_CREATE.
export async function guildDelete(guild, env, openStore) {
  // unavailable means a Discord outage, not a removal.
  if (guild.unavailable) return;
  if (guild.id === env.DISCORD_GUILD_ID) {
    // The log channel lives in the home server, so it can no longer be reached.
    console.error("Bot was removed from the home server", guild.id);
    return;
  }
  return sendLog(
    env,
    {
      color: logColors.warning,
      title: "Left server",
      description: guild.autoLeave
        ? "Left automatically because this server is not authorized."
        : "The bot was removed from this server.",
      fields: guildFields(guild),
    },
    openStore,
  );
}

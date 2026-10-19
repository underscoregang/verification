import { discord } from "../../discord/client.js";
import { sendLog, logColors, guildFields } from "../../discord/logs.js";

// Discord replays GUILD_CREATE for every server on each new Gateway session, so
// only a recent joined_at means the bot was just added.
const recentlyJoined = (guild) =>
  Date.now() - Date.parse(guild.joined_at) < 5 * 60000;

// The audit log names who added the bot, when the invite granted View Audit Log.
async function addedBy(env, guildId) {
  try {
    const log = await discord(
      env,
      `/guilds/${guildId}/audit-logs?action_type=28&limit=10`,
    );
    const entry = log.audit_log_entries?.find(
      (item) => item.target_id === env.DISCORD_CLIENT_ID,
    );
    const user = entry && log.users?.find((item) => item.id === entry.user_id);
    return user ? `<@${user.id}> (${user.username}, \`${user.id}\`)` : null;
  } catch {
    return null;
  }
}

export async function guildCreate(guild, env, openStore) {
  if (guild.unavailable) return;
  if (guild.id === env.DISCORD_GUILD_ID) {
    if (!recentlyJoined(guild)) return;
    return sendLog(
      env,
      {
        color: logColors.success,
        title: "Joined home server",
        fields: guildFields(guild),
      },
      openStore,
    );
  }
  // This bot serves one server only; leave any other server it is invited to.
  const inviter = await addedBy(env, guild.id);
  let left = true;
  await discord(env, `/users/@me/guilds/${guild.id}`, "DELETE").catch(
    (error) => {
      left = false;
      console.error(
        "Unauthorized server leave failed",
        error.name,
        error.status || "",
      );
    },
  );
  return sendLog(
    env,
    {
      color: logColors.danger,
      title: recentlyJoined(guild)
        ? "Invited to an unauthorized server"
        : "Found in an unauthorized server",
      description: left
        ? "This bot only works in the home server, so it left automatically."
        : "Leaving the server failed. Remove the bot from this server manually.",
      fields: [
        ...guildFields(guild),
        {
          name: "Added by",
          value: inviter || "Unknown (no audit log access)",
          inline: true,
        },
      ],
    },
    openStore,
  );
}

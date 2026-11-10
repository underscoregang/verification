import { notice } from "../../components/v2.js";
import { discord } from "../../discord/client.js";
import { hasPermission } from "../../shared/security.js";
import { resolveYoutube } from "../../services/youtube.js";
import { checkChannels } from "../../discord/channels.js";

export const isSetup = (i) =>
  i.type === 2 &&
  ["tiktok", "youtube", "getrole", "channel"].includes(i.data?.name);
export function setupPermission(i) {
  return hasPermission(
    i.member?.permissions,
    i.data.name === "getrole" ? 268435456n : 32n,
  );
}
async function validateRole(config, interaction, id) {
  const [roles, bot, guild] = await Promise.all([
    discord(config, `/guilds/${config.DISCORD_GUILD_ID}/roles`),
    discord(
      config,
      `/guilds/${config.DISCORD_GUILD_ID}/members/${config.DISCORD_CLIENT_ID}`,
    ),
    discord(config, `/guilds/${config.DISCORD_GUILD_ID}`),
  ]);
  const role = roles.find((item) => item.id === id);
  if (!role) return "That role does not exist in this server.";
  if (role.id === config.DISCORD_GUILD_ID || role.managed)
    return "Choose a normal access role, not @everyone or an integration-managed role.";
  // Access verification must never award server administration permissions.
  if ((BigInt(role.permissions) & (8n | 32n | 268435456n)) !== 0n)
    return "Choose an access role without Administrator, Manage Server, or Manage Roles permissions.";
  const highest = (ids) =>
    Math.max(
      0,
      ...roles
        .filter((item) => ids.includes(item.id))
        .map((item) => item.position),
    );
  const botPermissions = roles
    .filter(
      (item) =>
        bot.roles.includes(item.id) || item.id === config.DISCORD_GUILD_ID,
    )
    .reduce((bits, item) => bits | BigInt(item.permissions), 0n);
  if (
    !hasPermission(botPermissions.toString(), 268435456n) ||
    highest(bot.roles) <= role.position
  )
    return "Give the bot Manage Roles and move its highest role above the selected role.";
  if (
    guild.owner_id !== interaction.member.user.id &&
    highest(interaction.member.roles || []) <= role.position
  )
    return "Choose a role below your own highest role.";
}
export async function configure(interaction, config, store) {
  if (!setupPermission(interaction))
    return notice(interaction.data.name === "getrole"
          ? "Manage Roles permission is required."
          : "Manage Server permission is required.", "danger");
  const { name, options = [] } = interaction.data;
  const actor = interaction.member.user.id;
  if (name === "channel" && options[0]?.name === "logs") {
    const channel = options[0].options?.find(
      (option) => option.name === "channel",
    )?.value;
    if (typeof channel !== "string" || !/^\d{17,20}$/.test(channel))
      return notice("Use `/channel logs channel:#bot-logs`.", "danger");
    const error = await checkChannels(config, [
      {
        id: channel,
        permissions: 1024n | 2048n | 16384n,
        label: "View Channel, Send Messages and Embed Links",
        private: true,
      },
    ]);
    if (error) return notice(error, "danger");
    await store.saveSetting("LOG_CHANNEL_ID", channel, actor);
    return notice(`Bot logs will be posted in <#${channel}>. This includes servers the bot joins or leaves; invites to other servers are left automatically.`, "success");
  }
  if (name === "channel") {
    const fields =
      options.find((option) => option.name === "setup")?.options || [];
    const submission = fields.find(
      (option) => option.name === "channel",
    )?.value;
    const review = fields.find(
      (option) => option.name === "review-channel",
    )?.value;
    if (
      ![submission, review].every(
        (value) => typeof value === "string" && /^\d{17,20}$/.test(value),
      )
    )
      return notice("Use `/channel setup channel:#verify review-channel:#staff-review`.", "danger");
    if (submission === review)
      return notice("Choose a separate private staff review channel so member screenshots are not posted publicly.", "danger");
    const error = await checkChannels(config, [
      {
        id: submission,
        permissions: 1024n | 2048n | 8192n,
        label: "View Channel, Send Messages and Manage Messages",
      },
      {
        id: review,
        permissions: 1024n | 2048n | 16384n | 32768n,
        label: "View Channel, Send Messages, Embed Links and Attach Files",
        private: true,
      },
    ]);
    if (error) return notice(error, "danger");
    await store.saveChannels(submission, review, actor);
    return notice(`Screenshot submissions: <#${submission}>. Staff reviews: <#${review}>.\nRun /panel in the channel where you want to post instructions. Members post screenshots directly in the submission channel; clear images are checked automatically and uncertain images go to staff.`, "success");
  }
  if (name === "getrole") {
    const roleId = (key) => {
      const raw = options.find((option) => option.name === key)?.value;
      return (
        typeof raw === "string" &&
        raw
          .trim()
          .match(/^(?:<@&(\d{17,20})>|(\d{17,20}))$/)
          ?.slice(1)
          .find(Boolean)
      );
    };
    const id = roleId("role");
    if (!id)
      return notice("Enter a role mention such as @Verified or a numeric role ID.", "danger");
    const removeGiven = options.some((option) => option.name === "remove-role");
    const removeId = removeGiven ? roleId("remove-role") : null;
    if (removeGiven && !removeId)
      return notice("Enter the role to remove as a mention such as @Unverified or a numeric role ID.", "danger");
    if (removeId === id)
      return notice("The role to remove must be different from the role given.", "danger");
    const error = await validateRole(config, interaction, id);
    if (error) return notice(error, "danger");
    if (removeId) {
      const removeError = await validateRole(config, interaction, removeId);
      if (removeError) return notice(`Role to remove: ${removeError}`, "danger");
    }
    await store.saveSetting(
      "VERIFIED_ROLE_ID",
      id,
      actor,
      config.VERIFIED_ROLE_ID,
    );
    // Running /getrole without remove-role clears a previously saved one.
    await store.saveSetting(
      "REMOVED_ROLE_ID",
      removeId,
      actor,
      config.REMOVED_ROLE_ID,
    );
    return notice(`Verification access role saved: <@&${id}>. Members receive this role only after satisfying the verification policy. ${removeId ? `Verified members also lose <@&${removeId}>.` : "No role is removed on verification."}`, "success");
  }
  const subcommand = options.find(
    (option) => option.name === "setup" && option.type === 1,
  );
  if (!subcommand)
    return notice(`Use /${name} setup to configure the creator account.`, "brand");
  if (name === "tiktok") {
    const raw = subcommand.options?.find(
      (option) => option.name === "username",
    )?.value;
    const username =
      typeof raw === "string" ? raw.trim().replace(/^@/, "").toLowerCase() : "";
    if (!/^[a-z0-9._]{2,24}$/.test(username))
      return notice("Enter a TikTok username with 2–24 letters, numbers, dots, or underscores, with or without @.", "danger");
    await store.saveSetting(
      "TIKTOK_USERNAME",
      username,
      actor,
      config.TIKTOK_USERNAME,
    );
    return notice(`TikTok target saved: @${username}. Clear screenshots are checked automatically; uncertain images go to staff. If the target changed, saved TikTok verification and pending reviews were reset; existing Discord roles are not removed.`, "success");
  }
  const result = await resolveYoutube(
    config,
    subcommand.options?.find((option) => option.name === "channel")?.value,
  );
  if (result.error) return notice(result.error, "danger");
  await store.saveSetting(
    "YOUTUBE_CHANNEL_ID",
    result.id,
    actor,
    config.YOUTUBE_CHANNEL_ID,
  );
  return notice(`YouTube target saved: https://www.youtube.com/channel/${result.id}. If the target changed, saved YouTube verification was reset; existing Discord roles are not removed.`, "success");
}

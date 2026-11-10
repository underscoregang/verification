import { commandHandlers } from "../../commands/index.js";
import { helpMessage } from "../../commands/help.js";
import { hasPermission } from "../../shared/security.js";
import { discord, editResponse } from "../../discord/client.js";
import { grant } from "../../discord/roles.js";
import { isSetup, setupPermission } from "../../commands/shared/setup.js";
import {
  message,
  reply,
  notice,
  enabled,
  target,
  reviewCard,
  IS_COMPONENTS_V2,
} from "../../components/index.js";

export function immediate(interaction, config) {
  const { type, data } = interaction;
  if (isSetup(interaction))
    return setupPermission(interaction)
      ? null
      : message(
          data.name === "getrole"
            ? "Manage Roles permission is required."
            : "Manage Server permission is required.",
        );
  if (type === 2 && ["panel", "verification-panel"].includes(data.name))
    return hasPermission(interaction.member.permissions, 32n)
      ? null
      : message("Manage Server permission is required.");
  if (type === 2 && data.name === "help")
    return reply(helpMessage(interaction));
  if (type === 3 && /^(approve|reject):\d{17,20}$/.test(data.custom_id))
    return hasPermission(interaction.member.permissions, 268435456n)
      ? null
      : message("Only staff with Manage Roles can review screenshots.");
  // Removed commands (/verify, /verification-status) and old upload buttons.
  return message(
    "Verification works by posting your screenshot as an image in the verification channel. It must show the creator's **@handle** and your **Subscribed** or **Following** status.",
    "warning",
  );
}
export async function perform(interaction, config, store) {
  const user = interaction.member.user.id,
    data = interaction.data;
  if (interaction.type === 2) {
    const command = commandHandlers.get(data.name);
    return command
      ? command(interaction, config, store)
      : notice("Unknown command. Use /help.", "danger");
  }
  if (
    interaction.type !== 3 ||
    !hasPermission(interaction.member.permissions, 268435456n)
  )
    return notice("Only staff with Manage Roles can review screenshots.", "danger");
  const [action, id] = data.custom_id.split(":");
  const review = await store.review(id);
  if (!review || review.status !== "pending")
    return notice("This review has already been handled or delivery failed.", "danger");
  const channelId = review.review_channel_id || config.REVIEW_CHANNEL_ID;
  if (
    interaction.channel_id !== channelId ||
    interaction.message?.id !== review.message_id ||
    interaction.message?.author?.id !== config.DISCORD_CLIENT_ID
  )
    return notice("Use the original staff review message.", "danger");
  if (review.user === user)
    return notice("Ask another staff member to review your own submission.", "danger");
  const platform = review.platform || "tiktok";
  if (
    !enabled(config, platform) ||
    (review.target && review.target !== target(config, platform))
  )
    return notice("The verification target changed. Ask the member to submit a new screenshot.", "danger");
  const decided = await store.decideReview(
    id,
    user,
    action === "approve",
    interaction.id,
  );
  if (!decided)
    return notice("Another staff member has already handled this review.", "danger");
  // Rebuild the V2 review card with the decision. Reviews posted before the
  // Components V2 rebuild are plain messages, so append the decision instead.
  const approve = action === "approve";
  await discord(
    config,
    `/channels/${channelId}/messages/${review.message_id}`,
    "PATCH",
    interaction.message.flags & IS_COMPONENTS_V2
      ? reviewCard({
          review,
          filename: interaction.message.attachments?.[0]?.filename,
          state: approve ? "approved" : "rejected",
          reviewer: user,
        })
      : {
          content: `${(interaction.message.content || "").slice(0, 1700)}\n\n**${approve ? "Approved" : "Rejected"}** by <@${user}>`,
          components: [],
          allowed_mentions: { parse: [] },
        },
  ).catch(() => {});
  const granted = approve && (await grant(config, store, review.user));
  return notice(
    `**${approve ? "Approved" : "Rejected"}.**${granted ? " Access role granted." : approve ? " The member still needs to pass the other platform." : " The member can submit a new screenshot."}`,
    approve ? "success" : "danger",
  );
}
export async function complete(interaction, config, store) {
  try {
    if (!(await store.claimInteraction(interaction.id))) return;
    await editResponse(
      config,
      interaction,
      await perform(interaction, config, store),
    );
  } catch (error) {
    console.error(
      "Screenshot verification operation failed",
      error.name,
      error.status || "",
    );
    const content =
      error.code === 11000
        ? "This social account is already approved for another Discord member. Ask staff to review the account link."
        : "The operation could not finish. Check the channel and role permissions, then retry.";
    await editResponse(config, interaction, notice(content, "danger")).catch(
      () => {},
    );
  }
}

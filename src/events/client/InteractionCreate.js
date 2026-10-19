import { commandHandlers } from "../../commands/index.js";
import { execute as verify } from "../../commands/verify.js";
import { hasPermission } from "../../shared/security.js";
import { discord, editResponse } from "../../discord/client.js";
import { grant } from "../../discord/roles.js";
import { isSetup, setupPermission } from "../../commands/shared/setup.js";
import {
  message,
  enabled,
  target,
  screenshotModal,
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
  if (type === 2 && ["verify", "verification-status"].includes(data.name))
    return null;
  if (type === 3 && /^(?:proof:)?(youtube|tiktok)$/.test(data.custom_id)) {
    const platform = data.custom_id.replace("proof:", "");
    return enabled(config, platform)
      ? screenshotModal(platform)
      : message("This platform is not enabled. Use /verify.");
  }
  if (type === 5 && /^image-proof:(youtube|tiktok)$/.test(data.custom_id))
    return null;
  if (type === 3 && /^(approve|reject):\d{17,20}$/.test(data.custom_id))
    return hasPermission(interaction.member.permissions, 268435456n)
      ? null
      : message("Only staff with Manage Roles can review screenshots.");
  return message(
    "This verification action has changed. Use /verify to upload a fresh screenshot.",
  );
}
export async function perform(interaction, config, store) {
  const user = interaction.member.user.id,
    data = interaction.data;
  if (interaction.type === 2) {
    const command = commandHandlers.get(data.name);
    return command
      ? command(interaction, config, store)
      : { content: "Unknown command. Use /verify." };
  }
  if (interaction.type === 5) return verify(interaction, config, store);
  if (
    interaction.type !== 3 ||
    !hasPermission(interaction.member.permissions, 268435456n)
  )
    return { content: "Only staff with Manage Roles can review screenshots." };
  const [action, id] = data.custom_id.split(":");
  const review = await store.review(id);
  if (!review || review.status !== "pending")
    return {
      content: "This review has already been handled or delivery failed.",
    };
  const channelId = review.review_channel_id || config.REVIEW_CHANNEL_ID;
  if (
    interaction.channel_id !== channelId ||
    interaction.message?.id !== review.message_id ||
    interaction.message?.author?.id !== config.DISCORD_CLIENT_ID
  )
    return { content: "Use the original staff review message." };
  if (review.user === user)
    return {
      content: "Ask another staff member to review your own submission.",
    };
  const platform = review.platform || "tiktok";
  if (
    !enabled(config, platform) ||
    (review.target && review.target !== target(config, platform))
  )
    return {
      content:
        "The verification target changed. Ask the member to submit a new screenshot.",
    };
  const decided = await store.decideReview(
    id,
    user,
    action === "approve",
    interaction.id,
  );
  if (!decided)
    return { content: "Another staff member has already handled this review." };
  await discord(
    config,
    `/channels/${channelId}/messages/${review.message_id}`,
    "PATCH",
    {
      content: `${(interaction.message.content || "").slice(0, 1700)}\n\n**${action === "approve" ? "Approved" : "Rejected"}** by <@${user}>`,
      components: [],
      allowed_mentions: { parse: [] },
    },
  ).catch(() => {});
  const granted =
    action === "approve" && (await grant(config, store, review.user));
  return {
    content: `${action === "approve" ? "Approved" : "Rejected"}.${granted ? " Access role granted." : action === "approve" ? " Other policy requirements still need approval. The member can check /verification-status." : " The member can submit a new screenshot."}`,
  };
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
        : "The operation could not finish. Check the image format and channel/role permissions, then retry. Saved approvals can retry the role with /verification-status.";
    await editResponse(config, interaction, { content, components: [] }).catch(
      () => {},
    );
  }
}

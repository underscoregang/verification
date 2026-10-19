import { scanScreenshot } from '../services/image-scan.js';
import { hasPermission } from "../shared/security.js";
import { discord, editResponse } from "./client.js";
import { grant } from "./roles.js";
import { isSetup, setupPermission, configure } from "./setup.js";
import {
  row,
  button,
  choices,
  message,
  enabled,
  target,
  channelLink,
  screenshotModal,
  panel,
} from "./components.js";
import {
  screenshotInput,
  screenshotFile,
  postScreenshot,
} from "../services/screenshots.js";
import { checkChannels } from "./channels.js";

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
const openChannel = (config) =>
  row({
    type: 2,
    style: 5,
    label: "Open verification channel",
    url: channelLink(config),
  });
export async function perform(interaction, config, store) {
  const user = interaction.member.user.id,
    data = interaction.data;
  if (isSetup(interaction)) return configure(interaction, config, store);
  if (
    interaction.type === 2 &&
    ["panel", "verification-panel"].includes(data.name)
  ) {
    if (!hasPermission(interaction.member.permissions, 32n))
      return { content: "Manage Server permission is required." };
    const channelId =
      data.options?.find((option) => option.name === "channel")?.value ||
      interaction.channel_id;
    const error = await checkChannels(config, [
      {
        id: channelId,
        permissions: 1024n | 2048n | 16384n,
        label: "View Channel, Send Messages and Embed Links",
      },
    ]);
    if (error) return { content: error };
    await discord(config, `/channels/${channelId}/messages`, "POST", {
      ...panel(config, channelId),
      nonce: interaction.id,
      enforce_nonce: true,
    });
    return {
      content: `Verification panel posted in <#${channelId}>. Members submit screenshots in <#${config.SUBMISSION_CHANNEL_ID}>.`,
    };
  }
  if (interaction.type === 2 && data.name === "verification-status") {
    const [record, latest] = await Promise.all([
      store.member(user),
      store.latestReview(user),
    ]);
    const granted = await grant(config, store, user);
    return {
      content: `YouTube: ${record?.youtube ? "approved" : "not approved"}\nTikTok: ${record?.tiktok ? "approved" : "not approved"}\nLatest submission: ${latest?.status || "none"}\n${granted ? "Your access role has been granted." : `Requirement: ${config.policy}. Submit proof in <#${config.SUBMISSION_CHANNEL_ID}> with /verify.`}`,
    };
  }
  if (
    interaction.type === 2 &&
    data.name === "verify" &&
    !data.options?.length
  ) {
    if (interaction.channel_id !== config.SUBMISSION_CHANNEL_ID)
      return {
        content: `Upload your screenshot in <#${config.SUBMISSION_CHANNEL_ID}>. No Google sign-in is needed.`,
        components: [openChannel(config)],
      };
    return {
      content:
        "Choose a platform, enter your username and attach a clear screenshot. Clear screenshots are checked automatically; uncertain images go to staff. No Google sign-in is needed.",
      components: [choices(config)],
    };
  }
  const isSubmission =
    interaction.type === 5 ||
    (interaction.type === 2 && data.name === "verify");
  if (isSubmission) {
    if (interaction.channel_id !== config.SUBMISSION_CHANNEL_ID)
      return {
        content: `Please submit in <#${config.SUBMISSION_CHANNEL_ID}> using /verify or its upload button.`,
        components: [openChannel(config)],
      };
    const platform =
      interaction.type === 5
        ? data.custom_id.split(":")[1]
        : data.options?.find((option) => option.name === "platform")?.value;
    if (!enabled(config, platform))
      return {
        content:
          "Choose an enabled platform and attach your screenshot with /verify.",
      };
    const input = screenshotInput(interaction);
    if (input.error) return { content: input.error };
    const record = await store.member(user);
    if (
      record?.[platform] &&
      (!record[`${platform}_target`] ||
        record[`${platform}_target`] === target(config, platform))
    )
      return {
        content:
          "You are already approved for this platform. Use /verification-status to retry the access role.",
      };
    const channel = await discord(
      config,
      `/channels/${config.REVIEW_CHANNEL_ID}`,
    );
    if (
      channel.guild_id !== config.DISCORD_GUILD_ID ||
      ![0, 5].includes(channel.type)
    )
      throw new Error("Invalid review channel");
    const review = await store.createImageReview(
      interaction.id,
      user,
      platform,
      input.username,
      input.attachment,
      target(config, platform),
      config.REVIEW_CHANNEL_ID,
    );
    if (!review)
      return {
        content:
          "You already have a pending screenshot. Please wait for staff review before submitting another.",
      };
    try {
      const file = await screenshotFile(input.attachment);
      const creator =
        platform === "youtube"
          ? `https://www.youtube.com/channel/${review.target}`
          : `https://www.tiktok.com/@${review.target}`;
      const sent = await postScreenshot(
        config,
        config.REVIEW_CHANNEL_ID,
        {
          content: `**${platform === "youtube" ? "YouTube" : "TikTok"} screenshot review**\nMember: <@${user}>\nClaimed account: @${input.username}\nRequired creator: ${creator}\nAutomatic image check in progress. Uncertain evidence needs staff review. Screenshots cannot prove account ownership.`,
          embeds: [
            {
              color: 0x8b5cf6,
              image: { url: `attachment://${file.filename}` },
              footer: {
                text: "Approve only clear, valid proof. Rejected members may submit a new screenshot.",
              },
            },
          ],
          allowed_mentions: { parse: [] },
          components: [
            row(
              button(`approve:${review.id}`, "Approve", 3),
              button(`reject:${review.id}`, "Reject", 4),
            ),
          ],
          nonce: review.id,
          enforce_nonce: true,
        },
        file,
      );
      await store.attachReview(review.id, sent.id, sent.attachments?.[0]?.url);
      const scan = await scanScreenshot(config, platform, file);
      await store.db.collection('reviews').updateOne({ _id: review.id }, { $set: { scan: { ...scan, checked_at: new Date() } } });
      if (scan.approved) {
        const decided = await store.decideReview(review.id, config.DISCORD_CLIENT_ID, true, 'image-scan:' + review.id);
        if (decided) {
          await discord(config, `/channels/${config.REVIEW_CHANNEL_ID}/messages/${sent.id}`, 'PATCH', {
            content: `**Automatically approved** screenshot from <@${user}>. Exact creator handle and subscription/follow state matched. Screenshot checks do not prove account ownership.`,
            components: [], allowed_mentions: { parse: [] },
          }).catch(() => {});
          const granted = await grant(config, store, user);
          return { content: granted ? 'Screenshot approved automatically. Your access role has been granted!' : 'Screenshot approved automatically. Complete the other platform requirement, or use /verification-status to retry your role.' };
        }
      } else {
        await discord(config, `/channels/${config.REVIEW_CHANNEL_ID}/messages/${sent.id}`, 'PATCH', {
          content: `**Staff review needed** for <@${user}> (${platform}). Claimed account: @${input.username}. Check: ${scan.reason}. Please inspect the creator and subscription/follow state before approving.`,
          allowed_mentions: { parse: [] },
        }).catch(() => {});
      }
    } catch (error) {
      await store.failReview(review.id);
      throw error;
    }
    return {
      content:
        "Screenshot submitted privately to staff. Your access role will be granted after approval when the requirement is met. Check /verification-status; please do not resubmit while pending.",
    };
  }
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

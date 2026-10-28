export const data = {
  name: "verify",
  description: "Upload a subscription or follow screenshot for staff review",
  type: 1,
  options: [
    {
      name: "platform",
      description: "Account shown in your screenshot",
      type: 3,
      choices: [
        {
          name: "YouTube",
          value: "youtube",
        },
        {
          name: "TikTok",
          value: "tiktok",
        },
      ],
    },
    {
      name: "screenshot",
      description: "PNG, JPG or WebP image (maximum 8 MB)",
      type: 11,
    },
  ],
};

import { scanScreenshot } from "../services/image-scan.js";
import { discord } from "../discord/client.js";
import { grant } from "../discord/roles.js";
import {
  row,
  button,
  choices,
  enabled,
  target,
  channelLink,
} from "../components/index.js";
import {
  componentV2,
  container,
  section,
  thumbnail,
} from "../components/v2.js";
import {
  screenshotInput,
  screenshotFile,
  postScreenshot,
} from "../services/screenshots.js";

const openChannel = (config) =>
  row({
    type: 2,
    style: 5,
    label: "Open verification channel",
    url: channelLink(config),
  });

// granted is false only when the policy still needs the other platform.
function passed(granted, platform, user, direct = false) {
  if (granted) {
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
    const response = componentV2(
      container(
        section(
          "## ✅ Verification Passed\n-# Thanks for supporting our server!\nCongratulations, you have passed verification and received your role.\n\nIf you don't see the role, run **/verification-status** to check and retry the role assignment.",
          thumbnail(avatar),
        ),
      ),
    );
    if (!direct) response.flags |= 64;
    return response;
  }
  return platform === "youtube"
    ? "✅ **YouTube passed!** Now send your TikTok follow screenshot to get the role."
    : "✅ **TikTok passed!** Now send your YouTube subscription screenshot to get the role.";
}

export async function execute(interaction, config, store, prepared = {}) {
  const user = interaction.member.user.id,
    data = interaction.data;
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
        "Post one clear screenshot directly in this channel. The bot will reply with the verification result. No Google sign-in is needed.",
      components: [],
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
      return passed(
        await grant(config, store, user),
        platform,
        interaction.member.user,
        prepared.direct,
      );
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
      null,
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
      const file = prepared.file || (await screenshotFile(input.attachment));
      const creator =
        platform === "youtube"
          ? `https://www.youtube.com/channel/${review.target}`
          : `https://www.tiktok.com/@${review.target}`;
      const sent = await postScreenshot(
        config,
        config.REVIEW_CHANNEL_ID,
        {
          content: `**${platform === "youtube" ? "YouTube" : "TikTok"} screenshot review**\nMember: <@${user}>\nRequired creator: ${creator}\nAutomatic image check in progress. Uncertain evidence needs staff review. Screenshots cannot prove account ownership.`,
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
          nonce: `r:${review.id}`,
          enforce_nonce: true,
        },
        file,
      );
      await store.attachReview(review.id, sent.id, sent.attachments?.[0]?.url);
      const scan =
        prepared.scan || (await scanScreenshot(config, platform, file));
      await store.db
        .collection("reviews")
        .updateOne(
          { _id: review.id },
          { $set: { scan: { ...scan, checked_at: new Date() } } },
        );
      if (scan.approved) {
        const decided = await store.decideReview(
          review.id,
          config.DISCORD_CLIENT_ID,
          true,
          "image-scan:" + review.id,
        );
        if (decided) {
          await discord(
            config,
            `/channels/${config.REVIEW_CHANNEL_ID}/messages/${sent.id}`,
            "PATCH",
            {
              content: `**Automatically approved** screenshot from <@${user}>. Exact creator handle and subscription/follow state matched. Screenshot checks do not prove account ownership.`,
              components: [],
              allowed_mentions: { parse: [] },
            },
          ).catch(() => {});
          return passed(
            await grant(config, store, user),
            platform,
            interaction.member.user,
            prepared.direct,
          );
        }
      } else {
        await discord(
          config,
          `/channels/${config.REVIEW_CHANNEL_ID}/messages/${sent.id}`,
          "PATCH",
          {
            content: `**Staff review needed** for <@${user}> (${platform}). Check: ${scan.reason}. Please inspect the creator and subscription/follow state before approving.`,
            allowed_mentions: { parse: [] },
          },
        ).catch(() => {});
      }
    } catch (error) {
      await store.failReview(review.id);
      throw error;
    }
    return {
      content:
        "🕵️ **Sent to staff review.** I couldn't confirm your screenshot automatically, so a staff member will check it. You'll get the role once it's approved, so there's no need to send it again.",
    };
  }
}

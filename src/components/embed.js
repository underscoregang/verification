import { enabled, row, channelLink } from "./controls.js";
export function panel(config, channelId) {
  const fields = [];
  if (enabled(config, "youtube"))
    fields.push({
      name: "YouTube",
      value: `[Subscribe to our channel](https://www.youtube.com/channel/${config.YOUTUBE_CHANNEL_ID})`,
      inline: true,
    });
  if (enabled(config, "tiktok"))
    fields.push({
      name: "TikTok",
      value: `[Follow @${config.TIKTOK_USERNAME}](https://www.tiktok.com/@${config.TIKTOK_USERNAME})`,
      inline: true,
    });
  const requirement =
    config.policy === "both"
      ? "Complete both YouTube and TikTok verification (submit one screenshot per platform)."
      : config.policy === "either"
        ? "Complete either YouTube or TikTok verification."
        : `Complete ${config.policy === "youtube" ? "YouTube" : "TikTok"} verification.`;
  return {
    embeds: [
      {
        color: 0x8b5cf6,
        title: "Unlock the Underscore Community",
        description: `Follow these steps to get access. ${requirement}\n\n**1. Subscribe or follow**\nUse the creator links below.\n\n**2. Take a screenshot**\nShow the creator name and your **Subscribed** or **Following** status clearly.\n\n**3. Submit your proof**\nGo to <#${config.SUBMISSION_CHANNEL_ID}> and send your screenshot as a normal image message. The bot replies with the result; no button or command is needed.\n\n**4. Automatic screenshot check**\nClear matches are approved automatically. Uncertain images go to staff. Once the requirement is met, the bot grants your access role.\n\n**Important**\nUse a clear, unedited screenshot. Blurry, incomplete or fake proof may be rejected. No Google sign-in is required.`,
        fields,
        footer: {
          text: "Need help? Contact a staff member. Check your submission with /verification-status.",
        },
      },
    ],
    components:
      channelId === config.SUBMISSION_CHANNEL_ID
        ? []
        : [
            row({
              type: 2,
              style: 5,
              label: "Verification Here",
              url: channelLink(config),
            }),
          ],
    allowed_mentions: { parse: [] },
  };
}

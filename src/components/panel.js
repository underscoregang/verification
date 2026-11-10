import { enabled, channelLink, creatorUrl } from "./controls.js";
import { v2, container, textDisplay, section, separator, linkButton, row } from "./v2.js";

function requirement(policy) {
  if (policy === "both")
    return "Complete **both** YouTube and TikTok verification (one screenshot per platform).";
  if (policy === "either") return "Complete **either** YouTube or TikTok verification.";
  return `Complete **${policy === "youtube" ? "YouTube" : "TikTok"}** verification.`;
}

// Public verification instructions posted by /panel.
export function panel(config, channelId) {
  const creators = [];
  if (enabled(config, "youtube"))
    creators.push(
      section(
        "**YouTube**\nSubscribe to our channel.",
        linkButton("Subscribe", creatorUrl("youtube", config.YOUTUBE_CHANNEL_ID)),
      ),
    );
  if (enabled(config, "tiktok"))
    creators.push(
      section(
        `**TikTok**\nFollow @${config.TIKTOK_USERNAME}.`,
        linkButton("Follow", creatorUrl("tiktok", config.TIKTOK_USERNAME)),
      ),
    );
  const steps = [
    "**1. Subscribe or follow**\nUse the creator links below.",
    "**2. Take a screenshot**\nShow the creator name and your **Subscribed** or **Following** status clearly.",
    `**3. Submit your proof**\nPost your screenshot as a normal image in <#${config.SUBMISSION_CHANNEL_ID}>. The bot replies with the result.`,
    "**4. Automatic check**\nClear matches are approved automatically and uncertain images go to staff. Once the requirement is met, you get your access role.",
  ].join("\n\n");
  return v2(
    container([
      textDisplay(`# Unlock the Underscore Community\n${requirement(config.policy)}`),
      separator(),
      textDisplay(steps),
      ...(creators.length ? [separator(), ...creators] : []),
      separator(),
      textDisplay("-# Need help? Contact a staff member."),
      channelId === config.SUBMISSION_CHANNEL_ID
        ? null
        : row(linkButton("Verification Here", channelLink(config))),
    ]),
  );
}

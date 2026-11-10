import { platformName, creatorUrl } from "./controls.js";
import { v2, card, thumbnail, separator, mediaGallery, textDisplay, container, row, button } from "./v2.js";

export const avatarUrl = (user) =>
  user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;

// Member-facing verification result. `who.mention` pings the member, which is
// only wanted for public replies in the submission channel.
function memberCard(who = {}, tone, title, body) {
  const { user, mention } = who;
  const ping = mention && user?.id;
  return v2(
    card({
      tone,
      title,
      body: ping ? `<@${user.id}> ${body}` : body,
      accessory: user?.id ? thumbnail(avatarUrl(user)) : undefined,
    }),
    { mentions: ping ? [user.id] : [] },
  );
}

const otherProof = (platform) =>
  platform === "youtube" ? "TikTok follow" : "YouTube subscription";

export const outcome = {
  processing: (who) =>
    memberCard(who, "info", "⏳ Checking your screenshot", "This usually takes a few seconds."),
  passed: (who) =>
    memberCard(
      who,
      "success",
      "✅ Verification Passed",
      "Congratulations, your access role is assigned.\n-# Thanks for supporting our server!\n\nIf you don't see the role, send your screenshot again or contact staff.",
    ),
  partial: (who, platform) =>
    memberCard(
      who,
      "success",
      `✅ ${platformName(platform)} passed`,
      `Now send your ${otherProof(platform)} screenshot to get the role.`,
    ),
  failed: (who, reason) => memberCard(who, "danger", "❌ Verification failed", reason),
  review: (who) =>
    memberCard(
      who,
      "warning",
      "🕵️ Sent to staff review",
      "I couldn't confirm your screenshot automatically, so a staff member will check it. You'll get the role once it's approved, so there's no need to send it again.",
    ),
  pending: (who) =>
    memberCard(
      who,
      "warning",
      "🕵️ Waiting for staff review",
      "Your last screenshot is still waiting for staff review. You'll get the role once it's approved, so there's no need to send it again.",
    ),
  error: (who, reason) => memberCard(who, "danger", "❌ Something went wrong", reason),
};

const reviewStates = {
  checking: { tone: "brand", actions: true, status: () => "⏳ Automatic image check in progress." },
  "needs-review": {
    tone: "warning",
    actions: true,
    status: ({ reason }) =>
      `🕵️ **Staff review needed.** Check: \`${reason || "unclear"}\`. Inspect the creator and subscription/follow state before approving.`,
  },
  "auto-approved": {
    tone: "success",
    status: () => "✅ **Automatically approved.** Exact creator handle and subscription/follow state matched.",
  },
  approved: { tone: "success", status: ({ reviewer }) => `✅ **Approved** by <@${reviewer}>` },
  rejected: { tone: "danger", status: ({ reviewer }) => `❌ **Rejected** by <@${reviewer}>` },
};

// Staff review message. The screenshot is the message attachment, shown through
// a media gallery because V2 messages only display attachments a component references.
export function reviewCard({ review, filename, state, reason, reviewer }) {
  const { tone, actions, status } = reviewStates[state];
  const platform = review.platform || "tiktok";
  return v2(
    container(
      [
        textDisplay(
          `## ${platformName(platform)} screenshot review\n**Member:** <@${review.user}>\n**Required creator:** ${creatorUrl(platform, review.target)}`,
        ),
        filename ? mediaGallery(`attachment://${filename}`) : null,
        textDisplay(status({ reason, reviewer })),
        separator(false),
        textDisplay(
          "-# Approve only clear, valid proof. Rejected members may submit a new screenshot. Screenshots cannot prove account ownership.",
        ),
        actions
          ? row(button(`approve:${review.id}`, "Approve", 3), button(`reject:${review.id}`, "Reject", 4))
          : null,
      ],
      tone,
    ),
  );
}

// Bot log entry for the /channel logs channel.
export function logCard({ tone = "brand", title, description, fields = [] }) {
  const details = fields.map((field) => `**${field.name}:** ${field.value}`).join("\n");
  const stamp = `-# <t:${Math.floor(Date.now() / 1000)}:f>`;
  return v2(card({ tone, title, body: [description, details, stamp].filter(Boolean).join("\n\n") }));
}

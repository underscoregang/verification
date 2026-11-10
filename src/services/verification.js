import { discord } from "../discord/client.js";
import { grant } from "../discord/roles.js";
import { target, outcome, reviewCard } from "../components/index.js";
import { postScreenshot } from "./screenshots.js";

// grant() gives the access role (and removes the /getrole remove-role, when set).
// A failed role assignment throws; false means the saved approvals do not meet
// the policy yet, which is expected only for "both" before the second platform.
async function finish(config, store, who, platform) {
  if (await grant(config, store, who.user.id)) return outcome.passed(who);
  if (config.policy === "both") return outcome.partial(who, platform);
  console.error("Approved screenshot did not satisfy the verification policy", platform);
  return outcome.error(
    who,
    "Your screenshot was approved, but the access role could not be given. Please contact staff.",
  );
}

// Records a scanned screenshot from the submission channel, posts the staff
// review card, and grants the role when the scan is a clear match. Returns the
// member's result card.
export async function submitScreenshot(config, store, { id, who, platform, attachment, file, scan }) {
  const user = who.user.id;
  // Already approved for the current target: re-sending retries the role.
  const record = await store.member(user);
  if (
    record?.[platform] &&
    (!record[`${platform}_target`] ||
      record[`${platform}_target`] === target(config, platform))
  )
    return finish(config, store, who, platform);
  const channel = await discord(config, `/channels/${config.REVIEW_CHANNEL_ID}`);
  if (
    channel.guild_id !== config.DISCORD_GUILD_ID ||
    ![0, 5].includes(channel.type)
  )
    throw new Error("Invalid review channel");
  // The review handle becomes members.<platform> on approval, and grant() needs
  // it to be a non-empty string. Screenshots cannot prove which social account
  // is the member's, so the identity is the Discord member itself (unique per
  // member, as the unique_youtube/unique_tiktok indexes require).
  const review = await store.createImageReview(
    id,
    user,
    platform,
    `discord_${user}`,
    attachment,
    target(config, platform),
    config.REVIEW_CHANNEL_ID,
  );
  if (!review) return outcome.pending(who);
  try {
    const reviewMessage = (state, extra) =>
      reviewCard({ review, filename: file.filename, state, ...extra });
    const sent = await postScreenshot(
      config,
      config.REVIEW_CHANNEL_ID,
      { ...reviewMessage("checking"), nonce: `r:${review.id}`, enforce_nonce: true },
      file,
    );
    await store.attachReview(review.id, sent.id, sent.attachments?.[0]?.url);
    await store.db
      .collection("reviews")
      .updateOne(
        { _id: review.id },
        { $set: { scan: { ...scan, checked_at: new Date() } } },
      );
    const editReview = (body) =>
      discord(
        config,
        `/channels/${config.REVIEW_CHANNEL_ID}/messages/${sent.id}`,
        "PATCH",
        body,
      ).catch(() => {});
    if (scan.approved) {
      const decided = await store.decideReview(
        review.id,
        config.DISCORD_CLIENT_ID,
        true,
        "image-scan:" + review.id,
      );
      if (decided) {
        await editReview(reviewMessage("auto-approved"));
        return finish(config, store, who, platform);
      }
    } else {
      await editReview(reviewMessage("needs-review", { reason: scan.reason }));
    }
  } catch (error) {
    await store.failReview(review.id);
    throw error;
  }
  return outcome.review(who);
}

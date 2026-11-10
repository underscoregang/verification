import { discord } from "../discord/client.js";
import { grant } from "../discord/roles.js";
import { target, outcome, reviewCard } from "../components/index.js";
import { postScreenshot } from "./screenshots.js";

// grant() gives the access role (and removes the /getrole remove-role, when set).
// It is false only while the policy still needs another platform; a failed role
// assignment throws, so false means this platform passed on its own.
async function finish(config, store, who, platform) {
  return (await grant(config, store, who.user.id))
    ? outcome.passed(who)
    : outcome.partial(who, platform);
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
  const review = await store.createImageReview(
    id,
    user,
    platform,
    null,
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

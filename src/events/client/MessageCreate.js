import { withStore } from "../../database/connection.js";
import {
  loadConfig,
  withSavedSettings,
  configurationHelp,
  ConfigurationError,
} from "../../config/runtime.js";
import { discord } from "../../discord/client.js";
import { ProviderError } from "../../http/client.js";
import { enabled, outcome } from "../../components/index.js";
import { screenshotFile, attachmentError } from "../../services/screenshots.js";
import { scanScreenshot } from "../../services/image-scan.js";
import { submitScreenshot } from "../../services/verification.js";

export const RESULT_TTL = 5000;

export async function messageCreate(message, env, openStore = withStore) {
  if (
    message.guild_id !== env.DISCORD_GUILD_ID ||
    message.author?.bot ||
    message.webhook_id ||
    !message.author?.id ||
    !message.attachments?.length
  )
    return;
  return openStore(env, async (store) => {
    const settings = await store.settings();
    if (message.channel_id !== settings.SUBMISSION_CHANNEL_ID) return;
    if (!(await store.claimInteraction(`message:${message.id}`))) return;
    let responseId;
    const who = { user: message.author, mention: true };
    // Every reply is a Components V2 card from the first post, so the progress
    // message can be edited into the result without switching message formats.
    const respond = async (payload) => {
      if (responseId) {
        const path = `/channels/${message.channel_id}/messages/${responseId}`;
        try {
          return await discord(env, path, "PATCH", payload);
        } catch (error) {
          console.error("Verification card edit failed; using fallback card", error.name, error.status || "");
          return discord(env, path, "PATCH", outcome.error(who, "The verification result could not be displayed. Send your screenshot again, or contact staff if your role is missing."));
        }
      }
      const response = await discord(env, `/channels/${message.channel_id}/messages`, "POST", {
        ...payload,
        message_reference: { message_id: message.id, fail_if_not_exists: false },
        nonce: `m:${message.id}`,
        enforce_nonce: true,
      });
      responseId = response.id;
    };
    // Channel messages cannot be ephemeral (flags 64 is interaction-only), so the
    // gateway deletes this public result after RESULT_TTL.
    await respond(
      await verifyMessage(message, env, store, settings, respond, who),
    ).catch((error) => {
      console.error("Result reply failed", error.name, error.status || "");
    });
    // The review channel keeps its own copy, so remove the member's screenshot here.
    await discord(
      env,
      `/channels/${message.channel_id}/messages/${message.id}`,
      "DELETE",
    ).catch((error) => {
      console.error(
        "Screenshot message delete failed",
        error.name,
        error.status || "",
      );
    });
    return (
      responseId && { channelId: message.channel_id, messageId: responseId }
    );
  });
}

// Short, non-secret failure code shown to the member so staff can diagnose without logs.
function failureReason(step, error) {
  if (error instanceof ProviderError)
    return `${step}: ${error.provider} ${error.status}`;
  return `${step}: ${error.name === "Error" ? error.message : error.name}`;
}

// Returns the member's result card; respond is used only for the progress card.
async function verifyMessage(message, env, store, settings, respond, who) {
  let step = "setup";
  try {
    const config = loadConfig(withSavedSettings(env, settings));
    if (message.attachments.length !== 1)
      return outcome.failed(who, "Please send one screenshot at a time.");
    const attachment = message.attachments[0];
    const invalid = attachmentError(attachment);
    if (invalid) return outcome.failed(who, invalid);
    const pending = await store.latestReview(message.author.id);
    if (pending?.status === "pending")
      return outcome.pending(who);
    await respond(outcome.processing(who));
    step = "download";
    const file = await screenshotFile(attachment);
    step = "scan";
    let platform = config.policy === "tiktok" ? "tiktok" : "youtube";
    let scan = await scanScreenshot(config, platform, file);
    if (["either", "both"].includes(config.policy) && !scan.approved) {
      if (scan.platform === "tiktok") {
        platform = "tiktok";
        scan = await scanScreenshot(config, platform, file);
      } else if (!scan.platform) {
        // Never guess a platform or award a role when the scanner cannot read it.
        return outcome.failed(who, "I couldn't tell whether this is YouTube or TikTok. Send a screenshot of the creator's page that clearly shows their **@handle** and your **Subscribed** or **Following** button.");
      }
    }
    if (
      (scan.platform && !enabled(config, scan.platform)) ||
      !enabled(config, platform)
    )
      return outcome.failed(who, "This platform isn't used for verification on this server.");
    const action = platform === "youtube" ? "Subscribed" : "Following";
    if (scan.reason === "wrong_creator")
      return outcome.failed(who, `This screenshot shows a different account. Please send a screenshot of **@${scan.handle}** showing **${action}**.`);
    if (scan.reason === "not_subscribed")
      return outcome.failed(who, `Your screenshot doesn't show **${action}** on **@${scan.handle}** yet. ${platform === "youtube" ? "Subscribe" : "Follow"}, then send a new screenshot.`);
    step = "review";
    return await submitScreenshot(config, store, { id: message.id, who, platform, attachment, file, scan });
  } catch (error) {
    const reason = failureReason(step, error);
    console.error("Direct screenshot verification failed", reason);
    return error instanceof ConfigurationError
      ? outcome.error(who, configurationHelp(error.issues))
      : outcome.error(who, `Something went wrong while checking your image. Please try again in a moment, or contact staff if it keeps happening. (${reason})`);
  }
}

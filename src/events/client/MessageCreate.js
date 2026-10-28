import { withStore } from "../../database/connection.js";
import {
  loadConfig,
  withSavedSettings,
  configurationHelp,
  ConfigurationError,
} from "../../config/runtime.js";
import { discord } from "../../discord/client.js";
import { ProviderError } from "../../http/client.js";
import { enabled } from "../../components/controls.js";
import { screenshotFile, screenshotInput } from "../../services/screenshots.js";
import { scanScreenshot } from "../../services/image-scan.js";
import { execute } from "../../commands/verify.js";

export const RESULT_TTL = 5000;

export function messageSubmission(message, platform) {
  const attachment = message.attachments[0];
  return {
    id: message.id,
    type: 2,
    channel_id: message.channel_id,
    member: { user: message.author, permissions: "0" },
    data: {
      name: "verify",
      options: [
        { name: "platform", value: platform },
        { name: "username", value: `discord_${message.author.id}` },
        { name: "screenshot", value: attachment.id },
      ],
      resolved: { attachments: { [attachment.id]: attachment } },
    },
  };
}

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
    const respond = async (text) => {
      const content = `<@${message.author.id}> ${text}`;
      const allowed_mentions = { parse: [], users: [message.author.id] };
      if (responseId)
        return discord(
          env,
          `/channels/${message.channel_id}/messages/${responseId}`,
          "PATCH",
          { content, allowed_mentions },
        );
      const response = await discord(
        env,
        `/channels/${message.channel_id}/messages`,
        "POST",
        {
          content,
          message_reference: {
            message_id: message.id,
            fail_if_not_exists: false,
          },
          allowed_mentions,
          nonce: `m:${message.id}`,
          enforce_nonce: true,
        },
      );
      responseId = response.id;
    };
    // Channel messages cannot be ephemeral (flags 64 is interaction-only), so the
    // gateway deletes this public result after RESULT_TTL.
    await respond(
      await verifyMessage(message, env, store, settings, respond),
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

// Returns the member's result text; respond is used only for the progress message.
async function verifyMessage(message, env, store, settings, respond) {
  let step = "setup";
  try {
    const config = loadConfig(withSavedSettings(env, settings));
    if (message.attachments.length !== 1)
      return "❌ **Failed.** Please send one screenshot at a time.";
    const interaction = messageSubmission(
      message,
      config.policy === "tiktok" ? "tiktok" : "youtube",
    );
    const input = screenshotInput(interaction);
    if (input.error)
      return "❌ **Failed.** Please upload a PNG, JPG or WebP screenshot (up to 8 MB) directly to Discord.";
    const pending = await store.latestReview(message.author.id);
    if (pending?.status === "pending")
      return "🕵️ Your last screenshot is still waiting for staff review. You'll get the role once it's approved, so there's no need to send it again.";
    await respond("⏳ Processing your screenshot…");
    step = "download";
    const file = await screenshotFile(input.attachment);
    step = "scan";
    let platform = config.policy === "tiktok" ? "tiktok" : "youtube";
    let scan = await scanScreenshot(config, platform, file);
    if (["either", "both"].includes(config.policy) && !scan.approved) {
      if (scan.platform === "tiktok") {
        platform = "tiktok";
        scan = await scanScreenshot(config, platform, file);
      } else if (!scan.platform) {
        // Never guess a platform or award a role when the scanner cannot read it.
        return "❌ **Failed.** I couldn't identify the platform automatically. Your screenshot appears to be a YouTube channel page; please use `/verify` and select **YouTube**, then attach this screenshot so it can be checked for your creator's handle and **Subscribed** status. If it is TikTok, select **TikTok** and show **Following**.";
      }
    }
    if (
      (scan.platform && !enabled(config, scan.platform)) ||
      !enabled(config, platform)
    )
      return "❌ **Failed.** This platform isn't used for verification on this server.";
    const action = platform === "youtube" ? "Subscribed" : "Following";
    if (scan.reason === "wrong_creator")
      return `❌ **Failed.** This screenshot shows a different account. Please send a screenshot of **@${scan.handle}** showing **${action}**.`;
    if (scan.reason === "not_subscribed")
      return `❌ **Failed.** Your screenshot doesn't show **${action}** on **@${scan.handle}** yet. ${platform === "youtube" ? "Subscribe" : "Follow"}, then send a new screenshot.`;
    interaction.data.options[0].value = platform;
    step = "review";
    const result = await execute(interaction, config, store, {
      file,
      scan,
      direct: true,
    });
    return result.content;
  } catch (error) {
    const reason = failureReason(step, error);
    console.error("Direct screenshot verification failed", reason);
    return error instanceof ConfigurationError
      ? configurationHelp(error.issues)
      : `❌ **Failed.** Something went wrong while checking your image. Please try again in a moment, or contact staff if it keeps happening. (${reason})`;
  }
}

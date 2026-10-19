import { withStore } from '../../database/connection.js';
import { loadConfig, withSavedSettings, configurationHelp, ConfigurationError } from '../../config/runtime.js';
import { discord } from '../../discord/client.js';
import { enabled } from '../../components/controls.js';
import { screenshotFile, screenshotInput } from '../../services/screenshots.js';
import { scanScreenshot } from '../../services/image-scan.js';
import { execute } from '../../commands/verify.js';

export function messageSubmission(message, platform) {
  const attachment = message.attachments[0];
  return {
    id: message.id, type: 2, channel_id: message.channel_id,
    member: { user: message.author, permissions: '0' },
    data: { name: 'verify', options: [
      { name: 'platform', value: platform },
      { name: 'username', value: `discord_${message.author.id}` },
      { name: 'screenshot', value: attachment.id },
    ], resolved: { attachments: { [attachment.id]: attachment } } },
  };
}

export async function messageCreate(message, env, openStore = withStore) {
  if (message.guild_id !== env.DISCORD_GUILD_ID || message.author?.bot ||
      message.webhook_id || !message.author?.id || !message.attachments?.length) return;
  return openStore(env, async store => {
    const settings = await store.settings();
    if (message.channel_id !== settings.SUBMISSION_CHANNEL_ID) return;
    if (!await store.claimInteraction(`message:${message.id}`)) return;
    let responseId;
    // Channel messages cannot be ephemeral (flags 64 is interaction-only), so the
    // result stays in the verify channel and pings the member.
    const respond = async text => {
      const content = `<@${message.author.id}> ${text}`;
      const allowed_mentions = { parse: [], users: [message.author.id] };
      if (responseId) return discord(env, `/channels/${message.channel_id}/messages/${responseId}`, 'PATCH', { content, allowed_mentions });
      const response = await discord(env, `/channels/${message.channel_id}/messages`, 'POST', {
        content, message_reference: { message_id: message.id, fail_if_not_exists: false },
        allowed_mentions, nonce: `m:${message.id}`, enforce_nonce: true,
      });
      responseId = response.id;
    };
    await verifyMessage(message, env, store, settings, respond);
    // The review channel keeps its own copy, so remove the member's screenshot here.
    await discord(env, `/channels/${message.channel_id}/messages/${message.id}`, 'DELETE').catch(error => {
      console.error('Screenshot message delete failed', error.name, error.status || '');
    });
  });
}

async function verifyMessage(message, env, store, settings, respond) {
  try {
    const config = loadConfig(withSavedSettings(env, settings));
    if (message.attachments.length !== 1) return respond('Please send one screenshot at a time (PNG, JPG or WebP, up to 8 MB).');
    const interaction = messageSubmission(message, config.policy === 'tiktok' ? 'tiktok' : 'youtube');
    const input = screenshotInput(interaction);
    if (input.error) return respond(input.error);
    const pending = await store.latestReview(message.author.id);
    if (pending?.status === 'pending') return respond('Your previous screenshot is pending staff review. Check /verification-status.');
    await respond('Checking your screenshot…');
    const file = await screenshotFile(input.attachment);
    let platform = config.policy === 'tiktok' ? 'tiktok' : 'youtube';
    let scan = await scanScreenshot(config, platform, file);
    if (['either', 'both'].includes(config.policy) && !scan.approved) {
      if (scan.platform === 'tiktok') {
        platform = 'tiktok';
        scan = await scanScreenshot(config, platform, file);
      } else if (!scan.platform) {
        // Never guess a platform or award a role when the scanner cannot read it.
        return respond('I could not identify the platform. Please use /verify platform:youtube or platform:tiktok with your screenshot so staff can review it.');
      }
    }
    if (scan.platform && !enabled(config, scan.platform)) return respond('This screenshot platform is not enabled for this server.');
    if (!enabled(config, platform)) return respond('This screenshot platform is not enabled for this server.');
    interaction.data.options[0].value = platform;
    const result = await execute(interaction, config, store, { file, scan, direct: true });
    await respond(result.content);
  } catch (error) {
    console.error('Direct screenshot verification failed', error.name, error.status || '');
    await respond(error instanceof ConfigurationError ? configurationHelp(error.issues) :
      'I could not finish checking this image. Please try again, or ask staff to check image/channel permissions. Saved approvals can retry the role with /verification-status.').catch(() => {});
  }
}

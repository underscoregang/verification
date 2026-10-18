import { hasPermission, validateProof } from './security.js';
import { discord, editResponse, grant } from './discord.js';
import { isSetup, setupPermission, configure } from './settings.js';
export const row = (...components) => ({ type: 1, components });
export const button = (custom_id, label, style = 1) => ({ type: 2, custom_id, label, style });
export function choices(config) {
  const buttons = [];
  if (config.policy !== 'tiktok') buttons.push(button('youtube', 'Verify YouTube'));
  if (config.policy !== 'youtube') buttons.push(button('tiktok', 'Submit TikTok evidence', 2));
  return row(...buttons);
}
export const message = (content, components = [], flags = 64) => ({ type: 4, data: { content, components, flags, allowed_mentions: { parse: [] } } });
const failure = 'The operation could not finish. Retry or ask an administrator to check permissions and account conflicts. Saved verification can be retried with /verification-status.';

export function immediate(interaction, config) {
  const { type, data } = interaction;
  if (isSetup(interaction)) return setupPermission(interaction) ? null : message(data.name === 'getrole' ? 'Manage Roles permission is required.' : 'Manage Server permission is required.');
  if (type === 2 && data.name === 'verify') return message('Choose a method. YouTube requires Discord and Google sign-in; TikTok evidence requires moderator approval.', [choices(config)]);
  if (type === 2 && data.name === 'verification-panel') {
    if (!hasPermission(interaction.member.permissions, 32n)) return message('Manage Server permission is required.');
    return message(`**Welcome to Underscore**\nVerify to unlock community channels. Requirement: **${config.policy}**. TikTok evidence is reviewed by moderators.`, [choices(config)], 0);
  }
  if (type === 3 && data.custom_id === 'tiktok' && config.policy !== 'youtube') {
    return { type: 9, data: { custom_id: 'tiktok-proof', title: 'TikTok follow review', components: [
      row({ type: 4, custom_id: 'handle', label: 'Your TikTok username (without @)', style: 1, max_length: 24, required: true }),
      row({ type: 4, custom_id: 'proof', label: 'HTTPS link to screenshot showing your follow', style: 1, max_length: 500, required: true }),
    ] } };
  }
  if (type === 2 && data.name === 'verification-status') return null;
  if (type === 3 && data.custom_id === 'youtube' && config.policy !== 'tiktok') return null;
  if (type === 5 && data.custom_id === 'tiktok-proof' && config.policy !== 'youtube') return null;
  if (type === 3 && /^(approve|reject):\d{17,20}$/.test(data.custom_id)) {
    if (interaction.channel_id !== config.REVIEW_CHANNEL_ID || !hasPermission(interaction.member.permissions, 268435456n)) return message('Review requires Manage Roles in the configured review channel.');
    return null;
  }
  return message('This action is unavailable. Use /verify to continue.');
}
export async function perform(interaction, config, store) {
  const user = interaction.member.user.id;
  const data = interaction.data;
  if (isSetup(interaction)) return configure(interaction, config, store);
  if (interaction.type === 2 && data.name === 'verification-status') {
    const record = await store.member(user);
    const granted = await grant(config, store, user);
    return { content: `YouTube: ${record?.youtube ? 'verified' : 'not verified'}\nTikTok: ${record?.tiktok ? 'moderator approved' : 'not approved'}\n${granted ? 'Access role granted.' : `Requirement: ${config.policy}. Use /verify to continue.`}` };
  }
  if (interaction.type === 3 && data.custom_id === 'youtube') {
    const token = await store.session({ stage: 'start', user });
    return { content: 'This private link expires in 10 minutes. Sign into this Discord account, then your YouTube account.', components: [row({ type: 2, style: 5, label: 'Continue securely', url: `${config.baseUrl}/start?token=${token}` })] };
  }
  if (interaction.type === 5) {
    const fields = data.components.flatMap(row => row.components || []);
    const proof = validateProof(fields.find(field => field.custom_id === 'handle')?.value, fields.find(field => field.custom_id === 'proof')?.value);
    if (!proof) return { content: 'Use a valid TikTok username and HTTPS screenshot URL.' };
    const channel = await discord(config, `/channels/${config.REVIEW_CHANNEL_ID}`);
    if (channel.guild_id !== config.DISCORD_GUILD_ID || ![0, 5].includes(channel.type)) throw new Error('Review channel must be a server text channel');
    const review = await store.createReview(interaction.id, user, proof.handle, proof.proof, config.TIKTOK_USERNAME);
    if (!review) return { content: 'You already have a pending review. Please wait for a moderator.' };
    try {
      const sent = await discord(config, `/channels/${config.REVIEW_CHANNEL_ID}/messages`, 'POST', {
        content: `**TikTok review**\nMember: <@${user}>\nClaimed account: @${proof.handle}\nMust follow: @${config.TIKTOK_USERNAME}\nEvidence: <${proof.proof}>\nCheck account ownership and follow evidence independently. Screenshots can be forged.`,
        allowed_mentions: { parse: [] }, components: [row(button(`approve:${review.id}`, 'Approve', 3), button(`reject:${review.id}`, 'Reject', 4))],
        nonce: review.id, enforce_nonce: true,
      });
      await store.attachReview(review.id, sent.id);
    } catch (error) { await store.failReview(review.id); throw error; }
    return { content: 'Evidence submitted. A moderator will review it. Use /verification-status to check the result.' };
  }
  const [action, id] = data.custom_id.split(':');
  const review = await store.review(id);
  if (!review || review.status !== 'pending') return { content: 'This review has already been handled or delivery failed.' };
  if (review.message_id !== interaction.message?.id) return { content: 'This is not the original review message.' };
  if (review.user === user) return { content: 'Ask another moderator to review your own submission.' };
  if (review.target && review.target !== config.TIKTOK_USERNAME) return { content: 'The TikTok target changed. Ask the member to submit new evidence.' };
  const decided = await store.decideReview(id, user, action === 'approve', interaction.id);
  if (!decided) return { content: 'Another moderator has already handled this review.' };
  // A cosmetic message edit must not prevent granting a saved approval.
  await discord(config, `/channels/${config.REVIEW_CHANNEL_ID}/messages/${review.message_id}`, 'PATCH', { components: [] }).catch(() => {});
  const granted = action === 'approve' && await grant(config, store, review.user);
  return { content: `Review ${action === 'approve' ? 'approved' : 'rejected'}.${granted ? ' Access role granted.' : ''}` };
}
export async function complete(interaction, config, store) {
  try {
    if (!await store.claimInteraction(interaction.id)) return;
    const result = await perform(interaction, config, store);
    await editResponse(config, interaction, result);
  } catch (error) {
    // Never log request URLs, OAuth codes, interaction tokens, or provider bodies.
    console.error('Interaction failed', error.name, error.status || '');
    await editResponse(config, interaction, { content: failure, components: [] }).catch(() => console.error('Could not update interaction response'));
  }
}

export const row = (...components) => ({ type: 1, components });
export const button = (custom_id, label, style = 1) => ({ type: 2, custom_id, label, style });
export const message = (content, components = [], flags = 64) => ({ type: 4, data: { content, components, flags, allowed_mentions: { parse: [] } } });
export const enabled = (config, platform) => ['youtube', 'tiktok'].includes(platform) && (config.policy === platform || ['either', 'both'].includes(config.policy));
export const target = (config, platform) => platform === 'youtube' ? config.YOUTUBE_CHANNEL_ID : config.TIKTOK_USERNAME;
export const channelLink = config => `https://discord.com/channels/${config.DISCORD_GUILD_ID}/${config.SUBMISSION_CHANNEL_ID}`;
export function choices(config) {
  return row(...['youtube', 'tiktok'].filter(platform => enabled(config, platform)).map(platform => button(`proof:${platform}`, `Upload ${platform === 'youtube' ? 'YouTube' : 'TikTok'} screenshot`)));
}
export function screenshotModal(platform) {
  return { type: 9, data: { custom_id: `image-proof:${platform}`, title: `${platform === 'youtube' ? 'YouTube' : 'TikTok'} screenshot`, components: [
    { type: 18, label: 'Your account username', description: 'Enter the username shown in your screenshot.', component: { type: 4, custom_id: 'username', style: 1, required: true, min_length: 2, max_length: 100 } },
    { type: 18, label: 'Upload your screenshot', description: 'Show the creator and Subscribed/Following clearly. PNG, JPG or WebP, up to 8 MB.', component: { type: 19, custom_id: 'screenshot', min_values: 1, max_values: 1, required: true, file_types: ['.png', '.jpg', '.jpeg', '.webp'] } },
  ] } };
}
export function panel(config, channelId) {
  const fields = [];
  if (enabled(config, 'youtube')) fields.push({ name: 'YouTube', value: `[Subscribe to our channel](https://www.youtube.com/channel/${config.YOUTUBE_CHANNEL_ID})`, inline: true });
  if (enabled(config, 'tiktok')) fields.push({ name: 'TikTok', value: `[Follow @${config.TIKTOK_USERNAME}](https://www.tiktok.com/@${config.TIKTOK_USERNAME})`, inline: true });
  const requirement = config.policy === 'both' ? 'Complete both YouTube and TikTok verification (submit one screenshot per platform).' : config.policy === 'either' ? 'Complete either YouTube or TikTok verification.' : `Complete ${config.policy === 'youtube' ? 'YouTube' : 'TikTok'} verification.`;
  return { embeds: [{ color: 0x8b5cf6, title: 'Unlock the Underscore Community', description: `Follow these steps to get access. ${requirement}\n\n**1. Subscribe or follow**\nUse the creator links below.\n\n**2. Take a screenshot**\nShow the creator name and your **Subscribed** or **Following** status clearly.\n\n**3. Submit your proof**\nGo to <#${config.SUBMISSION_CHANNEL_ID}> and click an upload button or use **/verify**. Attach the screenshot directly in Discord.\n\n**4. Automatic screenshot check**\nClear matches are approved automatically. Uncertain images go to staff. Once the requirement is met, the bot grants your access role.\n\n**Important**\nUse a clear, unedited screenshot. Blurry, incomplete or fake proof may be rejected. No Google sign-in is required.`, fields, footer: { text: 'Need help? Contact a staff member. Check your submission with /verification-status.' } }],
    components: channelId === config.SUBMISSION_CHANNEL_ID ? [choices(config)] : [row({ type: 2, style: 5, label: 'Open verification channel', url: channelLink(config) })], allowed_mentions: { parse: [] } };
}

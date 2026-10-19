export const row = (...components) => ({ type: 1, components });
export const button = (custom_id, label, style = 1) => ({ type: 2, custom_id, label, style });
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

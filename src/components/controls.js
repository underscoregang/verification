export const platformName = (platform) =>
  platform === "youtube" ? "YouTube" : "TikTok";
export const enabled = (config, platform) =>
  ["youtube", "tiktok"].includes(platform) &&
  (config.policy === platform || ["either", "both"].includes(config.policy));
export const target = (config, platform) =>
  platform === "youtube" ? config.YOUTUBE_CHANNEL_ID : config.TIKTOK_USERNAME;
export const creatorUrl = (platform, value) =>
  platform === "youtube"
    ? `https://www.youtube.com/channel/${value}`
    : `https://www.tiktok.com/@${value}`;
export const channelLink = (config) =>
  `https://discord.com/channels/${config.DISCORD_GUILD_ID}/${config.SUBMISSION_CHANNEL_ID}`;

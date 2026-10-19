export function configIssues(env, { setup = false } = {}) {
  const issues = [];
  const policy = env.VERIFICATION_POLICY || "either";
  if (!["youtube", "tiktok", "either", "both"].includes(policy))
    issues.push("VERIFICATION_POLICY must be youtube, tiktok, either, or both");
  const required = [
    "DISCORD_TOKEN",
    "DISCORD_CLIENT_ID",
    "DISCORD_PUBLIC_KEY",
    "DISCORD_GUILD_ID",
    "PUBLIC_URL",
  ];
  if (!setup) required.push("VERIFIED_ROLE_ID");
  if (policy !== "tiktok" && !setup)
    required.push(
      "DISCORD_CLIENT_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "YOUTUBE_CHANNEL_ID",
    );
  if (policy !== "youtube" && !setup)
    required.push("REVIEW_CHANNEL_ID", "TIKTOK_USERNAME");
  for (const key of required)
    if (!env[key]?.trim()) issues.push(`Missing ${key}`);
  for (const key of [
    "DISCORD_CLIENT_ID",
    "DISCORD_GUILD_ID",
    ...(!setup ? ["VERIFIED_ROLE_ID"] : []),
    ...(policy !== "youtube" && !setup ? ["REVIEW_CHANNEL_ID"] : []),
  ]) {
    if (env[key] && !/^\d{17,20}$/.test(env[key]))
      issues.push(
        `${key} must be a Discord ID (enable Developer Mode to copy IDs)`,
      );
  }
  if (env.DISCORD_PUBLIC_KEY && !/^[a-f0-9]{64}$/i.test(env.DISCORD_PUBLIC_KEY))
    issues.push(
      "DISCORD_PUBLIC_KEY must be the 64-character public key from General Information",
    );
  if (
    !setup &&
    env.YOUTUBE_CHANNEL_ID &&
    !/^UC[\w-]{22}$/.test(env.YOUTUBE_CHANNEL_ID)
  )
    issues.push("YOUTUBE_CHANNEL_ID must be a UC... channel ID, not a handle");
  if (
    !setup &&
    policy !== "youtube" &&
    env.TIKTOK_USERNAME &&
    !/^[a-z0-9._]{2,24}$/i.test(env.TIKTOK_USERNAME)
  )
    issues.push("TIKTOK_USERNAME must be a username without @");
  if (env.PUBLIC_URL) {
    try {
      const url = new URL(env.PUBLIC_URL);
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      )
        issues.push("PUBLIC_URL must use HTTPS (except localhost)");
      if (
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        issues.push("PUBLIC_URL must be an origin without a path");
    } catch {
      issues.push("PUBLIC_URL must be a valid URL");
    }
  }
  return issues;
}
export class ConfigurationError extends Error {
  constructor(issues) {
    super('Verification configuration is incomplete');
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}

export function configurationHelp(issues) {
  const guidance = [];
  const includes = key => issues.some(issue => issue.includes(key));
  if (includes('VERIFIED_ROLE_ID')) guidance.push('A server administrator must run `/getrole role:@Verified` (or supply the role ID). The bot role must be above the selected role.');
  if (includes('YOUTUBE_CHANNEL_ID')) guidance.push('A server administrator must set the YouTube channel with `/youtube setup channel:...`.');
  if (includes('TIKTOK_USERNAME')) guidance.push('A server administrator must set the TikTok account with `/tiktok setup username:...`.');
  if (includes('REVIEW_CHANNEL_ID')) guidance.push('The bot owner must configure the private TikTok review channel.');
  if (includes('GOOGLE_CLIENT')) guidance.push('The bot owner must configure the Google OAuth client credentials.');
  if (includes('DISCORD_CLIENT_SECRET')) guidance.push('The bot owner must configure the Discord OAuth client secret.');
  if (!guidance.length) guidance.push('Ask the bot owner to check the verification configuration.');
  return `Verification setup is incomplete.\n${guidance.join('\n')}\nAfter setup, retry /verify.`;
}

export function loadConfig(env, options) {
  const issues = configIssues(env, options);
  if (issues.length) throw new ConfigurationError(issues);
  return {
    ...env,
    policy: env.VERIFICATION_POLICY || "either",
    baseUrl: new URL(env.PUBLIC_URL).origin,
  };
}
export function qualifies(policy, record) {
  const youtube = Boolean(record?.youtube),
    tiktok = Boolean(record?.tiktok);
  return policy === "both"
    ? youtube && tiktok
    : policy === "either"
      ? youtube || tiktok
      : policy === "youtube"
        ? youtube
        : policy === "tiktok"
          ? tiktok
          : false;
}

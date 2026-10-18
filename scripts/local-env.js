import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function localEnv() {
  const env = {};
  const argument = process.argv.find(value => value.startsWith('--env-file='));
  const selected = argument?.slice('--env-file='.length) || process.env.ENV_FILE;
  if (selected && !existsSync(resolve(root, selected))) throw new Error('Selected environment file does not exist');
  for (const file of [selected || '.env']) {
    const path = resolve(root, file);
    if (existsSync(path)) Object.assign(env, parse(readFileSync(path)));
  }
  return { ...env, ...process.env };
}
export const keys = ['MONGODB_URI', 'MONGODB_DB_NAME', 'DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'VERIFIED_ROLE_ID', 'REVIEW_CHANNEL_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'YOUTUBE_CHANNEL_ID', 'YOUTUBE_API_KEY', 'TIKTOK_USERNAME', 'VERIFICATION_POLICY', 'PUBLIC_URL'];

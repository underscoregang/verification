import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function localEnv() {
  const env = {};
  for (const file of ['.env']) {
    const path = resolve(root, file);
    if (existsSync(path)) Object.assign(env, parse(readFileSync(path)));
  }
  return { ...env, ...process.env };
}
export const keys = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'VERIFIED_ROLE_ID', 'REVIEW_CHANNEL_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'YOUTUBE_CHANNEL_ID', 'YOUTUBE_API_KEY', 'TIKTOK_USERNAME', 'VERIFICATION_POLICY', 'PUBLIC_URL'];

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

// CLI-only module. The Worker never imports local files or credentials.
export const root = fileURLToPath(new URL('../../', import.meta.url));
export function localEnv() {
  const argument = process.argv.find(value => value.startsWith('--env-file='));
  const selected = argument?.slice('--env-file='.length) || process.env.ENV_FILE || '.env';
  const path = resolve(root, selected);
  if (!existsSync(path)) throw new Error('Selected environment file does not exist');
  return { ...parse(readFileSync(path)), ...process.env };
}
export const keys = ['MONGODB_URI', 'MONGODB_DB_NAME', 'DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_GUILD_ID', 'YOUTUBE_CHANNEL_ID', 'YOUTUBE_API_KEY', 'TIKTOK_USERNAME', 'VERIFICATION_POLICY', 'PUBLIC_URL'];

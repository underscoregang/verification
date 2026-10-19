import { setupPermission } from '../shared/setup.js';
export async function execute(interaction, config) {
  if (!setupPermission(interaction)) return { content: 'Manage Server permission is required.' };
  const value = config.TIKTOK_USERNAME;
  return { content: value ? 'TikTok creator: https://www.tiktok.com/@' + value : 'No creator configured. Use /tiktok setup.' };
}

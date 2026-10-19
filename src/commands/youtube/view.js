import { setupPermission } from '../shared/setup.js';
export async function execute(interaction, config) {
  if (!setupPermission(interaction)) return { content: 'Manage Server permission is required.' };
  const value = config.YOUTUBE_CHANNEL_ID;
  return { content: value ? 'YouTube creator: https://www.youtube.com/channel/' + value : 'No creator configured. Use /youtube setup.' };
}

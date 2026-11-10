import { setupPermission } from '../shared/setup.js';
import { notice, v2, card, linkButton } from '../../components/v2.js';
import { creatorUrl } from '../../components/controls.js';
export async function execute(interaction, config) {
  if (!setupPermission(interaction)) return notice('Manage Server permission is required.', 'danger');
  const value = config.YOUTUBE_CHANNEL_ID;
  if (!value) return notice('No YouTube creator configured. Use **/youtube setup**.', 'warning');
  return v2(card({ title: 'YouTube creator', body: `Channel ID: \`${value}\``, accessory: linkButton('Open channel', creatorUrl('youtube', value)) }));
}

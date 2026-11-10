import { setupPermission } from '../shared/setup.js';
import { notice, v2, card, linkButton } from '../../components/v2.js';
import { creatorUrl } from '../../components/controls.js';
export async function execute(interaction, config) {
  if (!setupPermission(interaction)) return notice('Manage Server permission is required.', 'danger');
  const value = config.TIKTOK_USERNAME;
  if (!value) return notice('No TikTok creator configured. Use **/tiktok setup**.', 'warning');
  return v2(card({ title: 'TikTok creator', body: `Username: **@${value}**`, accessory: linkButton('Open profile', creatorUrl('tiktok', value)) }));
}

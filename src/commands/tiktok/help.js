import { setupPermission } from '../shared/setup.js';
import { notice, v2, card } from '../../components/v2.js';
export async function execute(interaction) {
  if (!setupPermission(interaction)) return notice('Manage Server permission is required.', 'danger');
  return v2(card({ title: 'TikTok verification', body: 'Use **/tiktok setup username:<@handle>** to select your creator.\nUse **/tiktok view** to see the current target.\nMembers post a clear screenshot directly in the verification channel showing the creator handle and **Following** state.' }));
}

import { setupPermission } from '../shared/setup.js';
import { notice, v2, card } from '../../components/v2.js';
export async function execute(interaction) {
  if (!setupPermission(interaction)) return notice('Manage Server permission is required.', 'danger');
  return v2(card({ title: 'YouTube verification', body: 'Use **/youtube setup channel:<@handle or channel ID>** to select your creator.\nUse **/youtube view** to see the current target.\nMembers post a clear screenshot directly in the verification channel showing the creator handle and **Subscribed** state.' }));
}

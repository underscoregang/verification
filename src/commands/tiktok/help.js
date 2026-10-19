import { setupPermission } from '../shared/setup.js';
import { componentV2, container, textDisplay } from '../../components/v2.js';
export async function execute(interaction) {
  if (!setupPermission(interaction)) return { content: 'Manage Server permission is required.' };
  return componentV2(container(textDisplay('## TikTok verification\nUse **/tiktok setup username:<@handle>** to select your creator.\nUse **/tiktok view** to see the current target.\nMembers use **/verify** to upload a clear screenshot showing the creator handle and **Following** state.')));
}

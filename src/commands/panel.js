export const data = {
  "name": "panel",
  "description": "Post the screenshot verification instructions",
  "type": 1,
  "default_member_permissions": "32",
  "options": [
    {
      "name": "channel",
      "description": "Where to post the panel; defaults to this channel",
      "type": 7,
      "channel_types": [
        0,
        5
      ]
    }
  ]
};

import { hasPermission } from '../shared/security.js';
import { discord } from '../discord/client.js';
import { panel } from '../components/index.js';
import { checkChannels } from '../discord/channels.js';

export async function execute(interaction, config, store) {
  const user = interaction.member.user.id, data = interaction.data;
  if (
    interaction.type === 2 &&
    ["panel", "verification-panel"].includes(data.name)
  ) {
    if (!hasPermission(interaction.member.permissions, 32n))
      return { content: "Manage Server permission is required." };
    const channelId =
      data.options?.find((option) => option.name === "channel")?.value ||
      interaction.channel_id;
    const error = await checkChannels(config, [
      {
        id: channelId,
        permissions: 1024n | 2048n | 16384n,
        label: "View Channel, Send Messages and Embed Links",
      },
    ]);
    if (error) return { content: error };
    await discord(config, `/channels/${channelId}/messages`, "POST", {
      ...panel(config, channelId),
      nonce: interaction.id,
      enforce_nonce: true,
    });
    return {
      content: `Verification panel posted in <#${channelId}>. Members submit screenshots in <#${config.SUBMISSION_CHANNEL_ID}>.`,
    };
  }

}

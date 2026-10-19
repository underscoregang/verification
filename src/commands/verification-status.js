export const data = {
  "name": "verification-status",
  "description": "Check verification and retry granting your access role",
  "type": 1
};

import { grant } from '../discord/roles.js';

export async function execute(interaction, config, store) {
  const user = interaction.member.user.id, data = interaction.data;
  if (interaction.type === 2 && data.name === "verification-status") {
    const [record, latest] = await Promise.all([
      store.member(user),
      store.latestReview(user),
    ]);
    const granted = await grant(config, store, user);
    return {
      content: `YouTube: ${record?.youtube ? "approved" : "not approved"}\nTikTok: ${record?.tiktok ? "approved" : "not approved"}\nLatest submission: ${latest?.status || "none"}\n${granted ? "Your access role has been granted." : `Requirement: ${config.policy}. Submit proof in <#${config.SUBMISSION_CHANNEL_ID}> with /verify.`}`,
    };
  }

}

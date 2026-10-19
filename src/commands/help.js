import { hasPermission } from '../shared/security.js';
import { container, textDisplay } from '../components/v2.js';

export const data = {
  "name": "help",
  "description": "Learn how to get verified and see the bot commands",
  "type": 1
};

const memberHelp = `## Underscore Verifier help
**How to get verified**
1. Subscribe or follow the creator using the links in the verification panel.
2. Take a screenshot that shows the creator's **@handle** and your **Subscribed** or **Following** status.
3. Post the screenshot as an image in the verification channel. The bot checks it, gives your role automatically, then removes your screenshot and its reply to keep the channel clean.

**Results**
✅ **Passed**: your access role is granted.
❌ **Failed**: follow the reason in the reply, then send a new screenshot.
🕵️ **Staff review**: the image was unclear, so staff will check it. No need to send it again.

**Commands**
\`/verify\`: upload a screenshot privately instead of posting it
\`/help\`: show this help`;

const staffHelp = `### Staff commands
\`/channel setup\`: choose the verification and private staff review channels
\`/channel logs\`: choose the private channel for bot logs
\`/getrole\`: choose the role given after verification
\`/youtube setup\` · \`view\` · \`help\`: set or check the YouTube creator
\`/tiktok setup\` · \`view\` · \`help\`: set or check the TikTok creator
\`/panel\`: post the verification instructions
Staff approve or reject unclear screenshots with the buttons in the review channel.`;

// Static text, so it is answered immediately without a database connection.
export function helpMessage(interaction) {
  const staff = hasPermission(interaction.member?.permissions, 32n) ||
    hasPermission(interaction.member?.permissions, 268435456n);
  return {
    flags: 64 | 32768,
    components: [container(textDisplay(memberHelp), ...(staff ? [textDisplay(staffHelp)] : []))],
    allowed_mentions: { parse: [] },
  };
}

export async function execute(interaction) {
  return helpMessage(interaction);
}

export const data = {
  "name": "tiktok",
  "description": "Configure TikTok verification",
  "type": 1,
  "default_member_permissions": "32",
  "options": [
    {
      "name": "setup",
      "description": "Set the TikTok account members must follow",
      "type": 1,
      "options": [
        {
          "name": "username",
          "description": "TikTok username, with or without @",
          "type": 3,
          "required": true,
          "max_length": 25
        }
      ]
    },
    {
      "name": "view",
      "description": "View the configured creator account",
      "type": 1
    },
    {
      "name": "help",
      "description": "Show setup and verification help",
      "type": 1
    }
  ]
};

import { execute as setup } from './setup.js';
import { execute as view } from './view.js';
import { execute as help } from './help.js';
const handlers = { setup, view, help };
export async function execute(interaction, config, store) {
  const action = interaction.data.options?.find(option => option.type === 1)?.name;
  return Object.hasOwn(handlers, action) ? handlers[action](interaction, config, store) : { content: 'Use /tiktok help.' };
}

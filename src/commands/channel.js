export const data = {
  "name": "channel",
  "description": "Configure screenshot verification channels",
  "type": 1,
  "default_member_permissions": "32",
  "options": [
    {
      "name": "setup",
      "description": "Choose the member submission and staff review channels",
      "type": 1,
      "options": [
        {
          "name": "channel",
          "description": "Channel where members submit screenshots with /verify",
          "type": 7,
          "channel_types": [
            0
          ],
          "required": true
        },
        {
          "name": "review-channel",
          "description": "Private channel for staff to approve or reject screenshots",
          "type": 7,
          "channel_types": [
            0
          ],
          "required": true
        }
      ]
    },
    {
      "name": "logs",
      "description": "Choose the private channel for bot logs such as server joins and leaves",
      "type": 1,
      "options": [
        {
          "name": "channel",
          "description": "Private staff channel for bot logs",
          "type": 7,
          "channel_types": [
            0
          ],
          "required": true
        }
      ]
    }
  ]
};

export { configure as execute } from './shared/setup.js';

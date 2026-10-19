export const data = {
  "name": "verification-panel",
  "description": "Post the Underscore verification panel",
  "type": 1,
  "default_member_permissions": "32",
  "options": [
    {
      "name": "channel",
      "description": "Where to post the panel",
      "type": 7,
      "channel_types": [
        0,
        5
      ]
    }
  ]
};

export { execute } from './panel.js';

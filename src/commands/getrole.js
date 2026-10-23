export const data = {
  "name": "getrole",
  "description": "Set the role awarded, and optionally a role removed, after successful verification",
  "type": 1,
  "default_member_permissions": "268435456",
  "options": [
    {
      "name": "role",
      "description": "Role mention, such as @Verified, or a role ID",
      "type": 3,
      "required": true,
      "max_length": 24
    },
    {
      "name": "remove-role",
      "description": "Optional role removed after verification, such as @Unverified, or a role ID",
      "type": 3,
      "required": false,
      "max_length": 24
    }
  ]
};

export { configure as execute } from './shared/setup.js';

export const data = {
  "name": "getrole",
  "description": "Set the role awarded after successful verification",
  "type": 1,
  "default_member_permissions": "268435456",
  "options": [
    {
      "name": "role",
      "description": "Role mention, such as @Verified, or a role ID",
      "type": 3,
      "required": true,
      "max_length": 24
    }
  ]
};

export { configure as execute } from './shared/setup.js';

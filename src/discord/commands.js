export const commands = [
  {
    name: 'channel', description: 'Configure screenshot verification channels', type: 1, default_member_permissions: '32',
    options: [{ name: 'setup', description: 'Choose the member submission and staff review channels', type: 1, options: [
      { name: 'channel', description: 'Channel where members submit screenshots with /verify', type: 7, channel_types: [0], required: true },
      { name: 'review-channel', description: 'Private channel for staff to approve or reject screenshots', type: 7, channel_types: [0], required: true },
    ] }],
  },
  { name: 'panel', description: 'Post the screenshot verification instructions', type: 1, default_member_permissions: '32', options: [
    { name: 'channel', description: 'Where to post the panel; defaults to this channel', type: 7, channel_types: [0, 5] },
  ] },
  {
    name: "tiktok",
    description: "Configure TikTok verification",
    type: 1,
    default_member_permissions: "32",
    options: [
      {
        name: "setup",
        description: "Set the TikTok account members must follow",
        type: 1,
        options: [
          {
            name: "username",
            description: "TikTok username, with or without @",
            type: 3,
            required: true,
            max_length: 25,
          },
        ],
      },
    ],
  },
  {
    name: "youtube",
    description: "Configure YouTube verification",
    type: 1,
    default_member_permissions: "32",
    options: [
      {
        name: "setup",
        description: "Set the YouTube channel members must subscribe to",
        type: 1,
        options: [
          {
            name: "channel",
            description:
              "YouTube @handle, username, channel URL, or UC... channel ID",
            type: 3,
            required: true,
            max_length: 200,
          },
        ],
      },
    ],
  },
  {
    name: "getrole",
    description: "Set the role awarded after successful verification",
    type: 1,
    default_member_permissions: "268435456",
    options: [
      {
        name: "role",
        description: "Role mention, such as @Verified, or a role ID",
        type: 3,
        required: true,
        max_length: 24,
      },
    ],
  },
  {
    name: "verify",
    description: "Upload a subscription or follow screenshot for staff review",
    type: 1,
    options: [
      { name: 'platform', description: 'Account shown in your screenshot', type: 3, choices: [{ name: 'YouTube', value: 'youtube' }, { name: 'TikTok', value: 'tiktok' }] },
      { name: 'screenshot', description: 'PNG, JPG or WebP image (maximum 8 MB)', type: 11 },
      { name: 'username', description: 'Your YouTube or TikTok username shown in the screenshot', type: 3, max_length: 100 },
    ],
  },
  {
    name: "verification-status",
    description: "Check verification and retry granting your access role",
    type: 1,
  },
  {
    name: "verification-panel",
    description: "Post the Underscore verification panel",
    type: 1,
    default_member_permissions: "32",
    options: [{ name: 'channel', description: 'Where to post the panel', type: 7, channel_types: [0, 5] }],
  },
];

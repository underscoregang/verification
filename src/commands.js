export const commands = [
  { name: 'tiktok', description: 'Configure TikTok verification', type: 1, default_member_permissions: '32', options: [
    { name: 'setup', description: 'Set the TikTok account members must follow', type: 1, options: [
      { name: 'username', description: 'TikTok username, with or without @', type: 3, required: true, max_length: 25 },
    ] },
  ] },
  { name: 'youtube', description: 'Configure YouTube verification', type: 1, default_member_permissions: '32', options: [
    { name: 'setup', description: 'Set the YouTube channel members must subscribe to', type: 1, options: [
      { name: 'channel', description: 'YouTube @handle, username, channel URL, or UC... channel ID', type: 3, required: true, max_length: 200 },
    ] },
  ] },
  { name: 'getrole', description: 'Set the role awarded after successful verification', type: 1, default_member_permissions: '268435456', options: [
    { name: 'role', description: 'Role mention, such as @Verified, or a role ID', type: 3, required: true, max_length: 24 },
  ] },
  { name: 'verify', description: 'Verify your subscription or submit TikTok evidence', type: 1 },
  { name: 'verification-status', description: 'Check verification and retry granting your access role', type: 1 },
  { name: 'verification-panel', description: 'Post the Underscore verification panel', type: 1, default_member_permissions: '32' },
];

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigurationError, configurationHelp, loadConfig } from '../src/config/runtime.js';
import { createWorker } from '../src/index.js';

const env = {
  DISCORD_TOKEN: 'fake-secret', DISCORD_CLIENT_ID: '100000000000000001',
  DISCORD_GUILD_ID: '100000000000000002', DISCORD_PUBLIC_KEY: 'a'.repeat(64),
  DISCORD_CLIENT_SECRET: 'fake-discord-secret', GOOGLE_CLIENT_ID: 'fake-google',
  GOOGLE_CLIENT_SECRET: 'fake-google-secret', YOUTUBE_CHANNEL_ID: `UC${'b'.repeat(22)}`,
  REVIEW_CHANNEL_ID: '100000000000000003', TIKTOK_USERNAME: 'underscore',
  SUBMISSION_CHANNEL_ID: '100000000000000007',
  PUBLIC_URL: 'https://example.com', VERIFICATION_POLICY: 'either',
};
test('missing access role produces a specific setup error without exposing credentials', () => {
  let failure;
  try { loadConfig(env); } catch (error) { failure = error; }
  assert.ok(failure instanceof ConfigurationError);
  assert.deepEqual(failure.issues, ['Missing VERIFIED_ROLE_ID']);
  const help = configurationHelp(failure.issues);
  assert.match(help, /\/getrole role:@Verified/);
  assert.doesNotMatch(help, /MongoDB|fake-secret|fake-google-secret/);
});
test('persisted role completes verification configuration', () => {
  const config = loadConfig({ ...env, VERIFIED_ROLE_ID: '100000000000000004' });
  assert.equal(config.VERIFIED_ROLE_ID, '100000000000000004');
});
test('creator and screenshot channel setup issues have relevant instructions', () => {
  assert.match(configurationHelp(['Missing YOUTUBE_CHANNEL_ID']), /\/youtube setup/);
  assert.match(configurationHelp(['Missing TIKTOK_USERNAME']), /\/tiktok setup/);
  assert.match(configurationHelp(['Missing REVIEW_CHANNEL_ID']), /\/channel setup/);
});
test('screenshot verification does not require Google or Discord OAuth credentials', () => {
  const config = loadConfig({ ...env, VERIFIED_ROLE_ID: '100000000000000004', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', DISCORD_CLIENT_SECRET: '' });
  assert.equal(config.policy, 'either');
});
test('signed verification click reports missing role rather than database failure', async () => {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const bindings = { ...env, DISCORD_PUBLIC_KEY: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('hex') };
  const payload = {
    type: 2, id: '100000000000000005', application_id: env.DISCORD_CLIENT_ID,
    guild_id: env.DISCORD_GUILD_ID, token: 'fake-interaction-token',
    member: { user: { id: '100000000000000006' }, permissions: '0' },
    data: { name: 'verify' },
  };
  const body = JSON.stringify(payload), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = Buffer.from(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(timestamp + body))).toString('hex');
  const replies = [], tasks = [], originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /discord.com\/api\/v10\/webhooks\//);
    replies.push(JSON.parse(options.body));
    return Response.json({ id: 'response' });
  };
  try {
    const worker = createWorker(async (env, operation) => operation({ settings: async () => ({}) }));
    const result = await worker.fetch(new Request('https://example.com/interactions', {
      method: 'POST', body, headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
    }), bindings, { waitUntil: task => tasks.push(task) });
    assert.deepEqual(await result.json(), { type: 5, data: { flags: 64 } });
    await Promise.all(tasks);
    assert.equal(replies.length, 1);
    assert.match(replies[0].content, /\/getrole role:@Verified/);
    assert.doesNotMatch(replies[0].content, /database could not/);
  } finally { globalThis.fetch = originalFetch; }
});

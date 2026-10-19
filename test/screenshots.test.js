import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { initializeDatabase } from '../src/database/connection.js';
import { Store } from '../src/database/store.js';
import { immediate, perform, complete } from '../src/events/client/InteractionCreate.js';
import { screenshotInput, screenshotFile } from '../src/services/screenshots.js';
import { panel } from '../src/components/index.js';
import { commands } from '../src/commands/index.js';

const id = suffix => `100000000000000${suffix.toString().padStart(3, '0')}`;
const config = { DISCORD_TOKEN: 'test-only', DISCORD_CLIENT_ID: id(1), DISCORD_GUILD_ID: id(2), VERIFIED_ROLE_ID: id(3), SUBMISSION_CHANNEL_ID: id(4), REVIEW_CHANNEL_ID: id(5), YOUTUBE_CHANNEL_ID: `UC${'a'.repeat(22)}`, TIKTOK_USERNAME: 'underscore', policy: 'either' };
const user = id(6), staff = id(7), botRole = id(8), messageId = id(9);
let serial = 10, replica, client, store, db;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIuoAAAAASUVORK5CYII=', 'base64');
const attachment = { id: id(99), size: png.length, content_type: 'image/png', url: `https://cdn.discordapp.com/ephemeral-attachments/${id(2)}/${id(99)}/proof.png` };
function submission(platform = 'youtube', memberId = user) {
  return { id: id(++serial), type: 5, channel_id: config.SUBMISSION_CHANNEL_ID, token: 'test-token', member: { user: { id: memberId }, permissions: '0' }, data: { custom_id: `image-proof:${platform}`, components: [
    { type: 18, component: { type: 4, custom_id: 'username', value: `member_${memberId}` } },
    { type: 18, component: { type: 19, custom_id: 'screenshot', values: [attachment.id] } },
  ], resolved: { attachments: { [attachment.id]: attachment } } } };
}
function decision(review, action = 'approve', memberId = staff) {
  return { id: id(++serial), type: 3, channel_id: review.review_channel_id || config.REVIEW_CHANNEL_ID, member: { user: { id: memberId }, permissions: '268435456' }, data: { custom_id: `${action}:${review.id}` }, message: { id: review.message_id, author: { id: config.DISCORD_CLIENT_ID }, content: 'Pending screenshot review' } };
}
function providers({ badImage = false, denyGrant = false, publicReview = false } = {}) {
  const calls = [];
  const handle = mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, ...options });
    if (url.hostname === 'cdn.discordapp.com') return new Response(badImage ? 'not an image' : png);
    if (url.pathname.endsWith('/roles')) return Response.json([{ id: config.DISCORD_GUILD_ID, permissions: publicReview ? '1024' : '0', position: 0 }, { id: config.VERIFIED_ROLE_ID, permissions: '0', position: 1, managed: false }, { id: botRole, permissions: '8', position: 10 }]);
    if (url.pathname.includes('/members/') && options.method !== 'PUT') return Response.json({ roles: [botRole] });
    if (options.method === 'PUT') return new Response(null, { status: denyGrant ? 403 : 204 });
    if (url.pathname.endsWith('/messages') && options.method === 'POST') {
      if (options.body instanceof FormData) {
        const payload = JSON.parse(options.body.get('payload_json'));
        assert.equal(payload.allowed_mentions.parse.length, 0);
        assert.equal(payload.embeds[0].image.url, 'attachment://proof.png');
        assert.deepEqual(Buffer.from(await options.body.get('files[0]').arrayBuffer()), png);
      }
      return Response.json({ id: messageId, attachments: [{ url: `https://cdn.discordapp.com/attachments/${config.REVIEW_CHANNEL_ID}/${messageId}/proof.png` }] });
    }
    if (options.method === 'PATCH') return Response.json({ id: messageId });
    if (url.pathname.startsWith('/api/v10/channels/')) return Response.json({ id: url.pathname.split('/').at(-1), guild_id: config.DISCORD_GUILD_ID, type: 0, permission_overwrites: [] });
    throw new Error(`Unexpected mock endpoint ${url.pathname}`);
  });
  return { calls, restore: () => handle.mock.restore() };
}
before(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.17' }, replSet: { count: 1 } });
  client = await new MongoClient(replica.getUri()).connect();
  db = client.db('screenshot_test');
  await initializeDatabase(db);
  store = new Store(db, client);
});
after(async () => { mock.restoreAll(); await client?.close(); await replica?.stop(); });

test('new commands provide panel posting, channel selection, and attachment fallback', () => {
  assert.ok(commands.some(item => item.name === 'panel'));
  const setup = commands.find(item => item.name === 'channel').options[0];
  assert.equal(setup.options.filter(item => item.required).length, 2);
  assert.equal(commands.find(item => item.name === 'verify').options.find(item => item.name === 'screenshot').type, 11);
});
test('both current and old platform buttons open native screenshot upload modals', () => {
  for (const custom_id of ['youtube', 'tiktok', 'proof:youtube', 'proof:tiktok']) {
    const result = immediate({ type: 3, data: { custom_id } }, config);
    assert.equal(result.type, 9);
    assert.equal(result.data.components[1].component.type, 19);
    assert.equal(result.data.components[1].component.max_values, 1);
    assert.doesNotMatch(JSON.stringify(result), /accounts.google|oauth/);
  }
});
test('panel has creator links, screenshot instructions, and correct channel navigation', () => {
  const outside = panel(config, id(90));
  assert.match(outside.embeds[0].description, /Automatic screenshot check/);
  assert.match(outside.embeds[0].description, /No Google sign-in/);
  assert.match(outside.components[0].components[0].url, new RegExp(config.SUBMISSION_CHANNEL_ID));
  assert.equal(panel(config, config.SUBMISSION_CHANNEL_ID).components[0].components[0].custom_id, 'proof:youtube');
  assert.match(panel({ ...config, policy: 'both' }, id(90)).embeds[0].description, /Complete both/);
});
test('modal and slash attachments validate Discord image metadata and reject external links', () => {
  assert.equal(screenshotInput(submission()).username, `member_${user}`);
  const bad = submission();
  bad.data.resolved.attachments[attachment.id] = { ...attachment, url: 'https://example.com/image.png' };
  assert.match(screenshotInput(bad).error, /directly to Discord/);
  const huge = submission(); huge.data.resolved.attachments[attachment.id] = { ...attachment, size: 9 * 1024 * 1024 };
  assert.match(screenshotInput(huge).error, /8 MB/);
  const svg = submission(); svg.data.resolved.attachments[attachment.id] = { ...attachment, content_type: 'image/svg+xml' };
  assert.ok(screenshotInput(svg).error);
});
test('staff review retains a Discord-hosted copy of screenshot and blocks duplicate pending proof', async () => {
  const provider = providers();
  try {
    const payload = submission();
    assert.match((await perform(payload, config, store)).content, /submitted privately/);
    const review = await store.review(payload.id);
    assert.equal(review.platform, 'youtube'); assert.equal(review.message_id, messageId);
    assert.match(review.proof, /\/attachments\//);
    assert.match((await perform(submission(), config, store)).content, /pending screenshot/);
    assert.equal(provider.calls.filter(item => item.body instanceof FormData).length, 1);
  } finally { provider.restore(); }
});
test('unauthorized, wrong-channel, forged-message, and self approval cannot grant roles', async () => {
  const review = await store.latestReview(user), provider = providers();
  try {
    const unauthorized = decision(review); unauthorized.member.permissions = '0';
    assert.match(immediate(unauthorized, config).data.content, /Only staff/);
    assert.match((await perform(unauthorized, config, store)).content, /Only staff/);
    assert.match((await perform(decision(review, 'approve', user), config, store)).content, /another staff/);
    const wrong = decision(review); wrong.channel_id = id(98);
    assert.match((await perform(wrong, config, store)).content, /original staff/);
    const forged = decision(review); forged.message.author.id = id(97);
    assert.match((await perform(forged, config, store)).content, /original staff/);
    assert.equal((await store.review(review.id)).status, 'pending');
    assert.equal(provider.calls.length, 0);
  } finally { provider.restore(); }
});
test('YouTube screenshot approval grants role, duplicate clicks do not grant twice', async () => {
  const provider = providers();
  try {
    const review = await store.latestReview(user);
    assert.match((await perform(decision(review), config, store)).content, /Access role granted/);
    assert.equal((await store.member(user)).youtube_target, config.YOUTUBE_CHANNEL_ID);
    assert.equal((await store.member(user)).tiktok, null);
    assert.match((await perform(decision(review), config, store)).content, /already been handled/);
    assert.equal(provider.calls.filter(item => item.method === 'PUT').length, 1);
  } finally { provider.restore(); }
});
test('both policy holds access until screenshots for both platforms are approved', async () => {
  const member = id(50), both = { ...config, policy: 'both' }, provider = providers();
  try {
    const youtube = submission('youtube', member); await perform(youtube, both, store);
    assert.doesNotMatch((await perform(decision(await store.review(youtube.id)), both, store)).content, /Access role granted/);
    const tiktok = submission('tiktok', member); await perform(tiktok, both, store);
    assert.match((await perform(decision(await store.review(tiktok.id)), both, store)).content, /Access role granted/);
    assert.equal(provider.calls.filter(item => item.method === 'PUT').length, 1);
  } finally { provider.restore(); }
});
test('invalid image bytes release pending lock for resubmission', async () => {
  const payload = submission('youtube', id(51)), provider = providers({ badImage: true });
  try {
    await assert.rejects(perform(payload, config, store), /Invalid screenshot/);
    assert.equal((await store.review(payload.id)).status, 'delivery_failed');
  } finally { provider.restore(); }
});
test('rejection allows another image and pending review does not grant access', async () => {
  const member = id(52), provider = providers();
  try {
    const payload = submission('youtube', member); await perform(payload, config, store);
    assert.match((await perform(decision(await store.review(payload.id), 'reject'), config, store)).content, /Rejected/);
    assert.equal(await store.member(member), null);
    assert.match((await perform(submission('youtube', member), config, store)).content, /submitted privately/);
    assert.equal(provider.calls.some(item => item.method === 'PUT'), false);
  } finally { provider.restore(); }
});
test('changing channels atomically persists settings without invalidating existing approval', async () => {
  await store.saveChannels(config.SUBMISSION_CHANNEL_ID, config.REVIEW_CHANNEL_ID, staff);
  assert.equal((await store.settings()).SUBMISSION_CHANNEL_ID, config.SUBMISSION_CHANNEL_ID);
  assert.ok((await store.member(user)).youtube);
});
test('channel setup rejects public staff channels and identical destinations', async () => {
  const provider = providers({ publicReview: true });
  try {
    const payload = { type: 2, member: { user: { id: staff }, permissions: '32' }, data: { name: 'channel', options: [{ name: 'setup', type: 1, options: [{ name: 'channel', value: config.SUBMISSION_CHANNEL_ID }, { name: 'review-channel', value: config.REVIEW_CHANNEL_ID }] }] } };
    assert.match((await perform(payload, config, store)).content, /Make.*private/);
    payload.data.options[0].options[1].value = config.SUBMISSION_CHANNEL_ID;
    assert.match((await perform(payload, config, store)).content, /separate private/);
  } finally { provider.restore(); }
});
test('image approval remains saved when Discord role assignment fails', async () => {
  const member = id(53), provider = providers({ denyGrant: true });
  try {
    const proof = submission('youtube', member); await perform(proof, config, store);
    await assert.rejects(perform(decision(await store.review(proof.id)), config, store));
    assert.equal((await store.review(proof.id)).status, 'approved');
    assert.ok((await store.member(member)).youtube);
  } finally { provider.restore(); }
});
test('concurrent staff decisions have a single transactional winner', async () => {
  const member = id(54), provider = providers();
  try {
    const proof = submission('youtube', member); await perform(proof, config, store);
    const results = await Promise.all([store.decideReview(proof.id, staff, true, id(++serial)), store.decideReview(proof.id, id(55), false, id(++serial))]);
    assert.equal(results.filter(Boolean).length, 1);
    const review = await store.review(proof.id);
    assert.equal(Boolean((await store.member(member))?.youtube), review.status === 'approved');
  } finally { provider.restore(); }
});
test('changing YouTube target rejects old pending YouTube screenshots', async () => {
  const previous = config.YOUTUBE_CHANNEL_ID;
  await store.saveSetting('YOUTUBE_CHANNEL_ID', `UC${'b'.repeat(22)}`, staff, previous);
  assert.equal((await store.latestReview(id(52))).status, 'rejected');
  assert.equal((await store.member(user)).youtube, null);
});

 test('clear AI screenshot automatically approves and grants the role', async () => {
  const provider = providers();
  try {
    const payload = submission('tiktok', id(800));
    const ai = { run: async () => ({ choices: [{ message: { content: JSON.stringify({ platform: 'tiktok', creator_handle: '@underscore', status: 'Following', clear: true, suspicious: false, confidence: 0.99 }) } }] }) };
    assert.match((await perform(payload, { ...config, AI: ai }, store)).content, /approved automatically/);
    assert.equal((await store.review(payload.id)).status, 'approved');
    assert.equal((await store.member(id(800))).tiktok_target, config.TIKTOK_USERNAME);
    assert.ok(provider.calls.some(call => call.method === 'PUT'));
  } finally { provider.restore(); }
 });
 test('uncertain AI results remain pending for staff without assigning a role', async () => {
  const provider = providers();
  try {
    const payload = submission('tiktok', id(801));
    assert.match((await perform(payload, { ...config, AI: { run: async () => ({ response: 'invalid JSON' }) } }, store)).content, /submitted privately/);
    assert.equal((await store.review(payload.id)).status, 'pending');
    assert.ok(!provider.calls.some(call => call.method === 'PUT'));
  } finally { provider.restore(); }
 });

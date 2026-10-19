import test from 'node:test';
import assert from 'node:assert/strict';
import { DiscordGateway } from '../src/discord/gateway.js';

function fixture() {
  const tasks = [], saved = new Map(), packets = [];
  const ctx = { blockConcurrencyWhile: operation => tasks.push(operation()), waitUntil: task => tasks.push(task),
    storage: { get: async key => saved.get(key), put: async (key, value) => saved.set(key, value), setAlarm: async value => saved.set('alarm', value), deleteAlarm: async () => saved.delete('alarm') } };
  const gateway = new DiscordGateway(ctx, { DISCORD_TOKEN: 'test-only', DISCORD_CLIENT_ID: '123' });
  const socket = { send: raw => packets.push(JSON.parse(raw)), close: () => {} };
  gateway.socket = socket;
  return { gateway, socket, packets, saved, tasks };
}
test('Gateway identifies with message intents, tracks READY and resumes its session', async () => {
  const { gateway, socket, packets } = fixture();
  try {
    gateway.packet({ op: 10, d: { heartbeat_interval: 45000 } }, socket);
    assert.equal(packets[0].op, 2);
    assert.equal(packets[0].d.intents, 1 | 512 | 32768);
    gateway.packet({ op: 0, s: 12, t: 'READY', d: { user: { id: '123' }, session_id: 'session', resume_gateway_url: 'wss://gateway.discord.gg' } }, socket);
    assert.equal(gateway.connected, true);
    gateway.packet({ op: 10, d: { heartbeat_interval: 45000 } }, socket);
    assert.equal(packets.at(-1).op, 6); assert.equal(packets.at(-1).d.seq, 12);
    gateway.heartbeat(socket); assert.equal(packets.at(-1).op, 1);
    gateway.packet({ op: 11 }, socket); assert.equal(gateway.acknowledged, true);
  } finally { await gateway.closed(socket, 4000); }
});
test('Gateway stops retrying fatal intent failures and clears expired sessions', async () => {
  const { gateway, socket, saved, tasks } = fixture();
  await Promise.all(tasks);
  await gateway.closed(socket, 4014);
  assert.equal(saved.get('blocked'), 'message_content_intent_required');
  assert.equal(gateway.connected, false);
  const other = fixture(); other.gateway.session = { sessionId: 'expired' };
  await other.gateway.closed(other.socket, 4009);
  assert.equal(other.gateway.session, null);
  assert.ok(other.saved.get('alarm') > Date.now());
});

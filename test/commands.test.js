import test from 'node:test';
import assert from 'node:assert/strict';
import { commands, commandHandlers } from '../src/commands/index.js';
import { perform } from '../src/events/client/InteractionCreate.js';
const config = { YOUTUBE_CHANNEL_ID: 'UCaaaaaaaaaaaaaaaaaaaaaa', TIKTOK_USERNAME: 'underscore' };
const interaction = (name, action, permissions = '32') => ({ type: 2, member: { user: { id: '100000000000000001' }, permissions }, data: { name, options: [{ type: 1, name: action }] } });
test('all registered commands have executable handlers and creator subcommands', () => {
 assert.equal(new Set(commands.map(command => command.name)).size, commands.length);
 for (const command of commands) assert.equal(typeof commandHandlers.get(command.name), 'function');
 for (const name of ['youtube', 'tiktok']) assert.deepEqual(commands.find(command => command.name === name).options.map(option => option.name), ['setup', 'view', 'help']);
});
test('creator view dispatches through the registry without database writes', async () => {
 assert.match((await perform(interaction('youtube', 'view'), config, {})).content, /youtube.com\/channel\/UC/);
 assert.match((await perform(interaction('tiktok', 'view'), config, {})).content, /tiktok.com\/@underscore/);
 assert.match((await perform(interaction('tiktok', 'view'), {}, {})).content, /No creator configured/);
});
test('creator help returns Components V2 without mixing legacy fields', async () => {
 for (const name of ['youtube', 'tiktok']) {
  const response = await perform(interaction(name, 'help'), config, {});
  assert.equal(response.flags, 32768); assert.equal(response.components[0].type, 17);
  assert.equal(response.components[0].components[0].type, 10);
  assert.match(response.components[0].components[0].content, /verification channel/);
  assert.ok(!('content' in response)); assert.ok(!('embeds' in response));
 }
});
test('read-only creator commands retain permission checks', async () => {
 for (const name of ['youtube', 'tiktok']) for (const action of ['view', 'help'])
  assert.match((await perform(interaction(name, action, '0'), config, {})).content, /Manage Server/);
});

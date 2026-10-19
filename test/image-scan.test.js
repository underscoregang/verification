import test from 'node:test';
import assert from 'node:assert/strict';
import { clearMatch, scanScreenshot } from '../src/services/image-scan.js';
const observation = { platform: 'youtube', creator_handle: '@creator', status: 'Subscribed', clear: true, suspicious: false, confidence: 0.99 };
test('image approval requires exact creator, active state and unambiguous evidence', () => {
 assert.equal(clearMatch(observation, 'youtube', 'creator'), true);
 for (const patch of [{ creator_handle: '@creator_fake' }, { platform: 'tiktok' }, { status: 'Subscribe' }, { clear: false }, { suspicious: true }, { confidence: 0.94 }, { confidence: '0.99' }, { confidence: 2 }]) assert.equal(clearMatch({ ...observation, ...patch }, 'youtube', 'creator'), false);
 assert.equal(clearMatch(observation, 'youtube', ''), false);
});
test('unavailable scanner and missing YouTube lookup fall back safely', async () => {
 assert.equal((await scanScreenshot({}, 'youtube', {})).approved, false);
 assert.equal((await scanScreenshot({ AI: { run: () => { throw new Error('must not run'); } } }, 'youtube', {})).reason, 'creator_lookup_unavailable');
});

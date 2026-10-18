import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { localEnv, root } from './local-env.js';
import { withStore, initializeDatabase, checkDatabase } from '../src/database.js';

const exec = promisify(execFile);
const env = localEnv();
async function readD1(table) {
  const { stdout } = await exec(process.execPath, [
    resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--remote',
    '--config', 'wrangler.d1-legacy.jsonc', '--json', '--command', `SELECT * FROM ${table}`,
  ], { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024, env: process.env });
  const results = JSON.parse(stdout);
  if (!Array.isArray(results) || results.some(result => !result.success)) throw new Error('Could not export D1');
  return results.flatMap(result => result.results);
}
try {
  // No plaintext export file: member data stays in memory and is never logged.
  const source = {};
  for (const name of ['members', 'reviews', 'settings']) source[name] = await readD1(name);
  await withStore(env, async store => {
    await initializeDatabase(store.db);
    await checkDatabase(store);
    const session = store.client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const name of Object.keys(source)) {
          if (await store.db.collection(name).countDocuments({}, { session })) throw new Error('Target collection is not empty');
        }
        for (const [name, rows] of Object.entries(source)) {
          const docs = rows.map(row => {
            if (name === 'settings') return { _id: row.key, value: row.value, updated_by: row.updated_by, updated_at: new Date(row.updated_at) };
            const { id, ...rest } = row;
            return { _id: String(id), ...rest, ...(name === 'reviews' ? { created_at: new Date(row.created_at) } : {}) };
          });
          for (let offset = 0; offset < docs.length; offset += 1000) await store.db.collection(name).insertMany(docs.slice(offset, offset + 1000), { session });
        }
      }, { timeoutMS: 120000, writeConcern: { w: 'majority' } });
    } finally { await session.endSession(); }
  }, { allowUninitialized: true });
  for (const [name, rows] of Object.entries(source)) console.log(`Imported ${rows.length} ${name} records.`);
  console.log('D1 source preserved. Temporary OAuth sessions and interaction claims were not migrated; members must start new verification links.');
} catch (error) {
  console.error(`Migration failed (${error.name}). Ensure the target collections are empty, MongoDB is reachable and supports transactions, and Wrangler can read the legacy D1 database. No source records were changed. Stop bot traffic while migrating.`);
  process.exitCode = 1;
}

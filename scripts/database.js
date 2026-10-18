import { localEnv } from './local-env.js';
import { withStore, initializeDatabase, checkDatabase, databaseIssues } from '../src/database.js';
const env = localEnv();
const issues = databaseIssues(env);
if (issues.length) { console.error(issues.join('\n')); process.exit(1); }
try {
  await withStore(env, async store => {
    if (process.argv[2] === 'init') await initializeDatabase(store.db);
    await checkDatabase(store);
  }, { allowUninitialized: process.argv[2] === 'init' });
  console.log(process.argv[2] === 'init' ? 'MongoDB initialized. Unique indexes, TTL expiration, and replica-set topology verified.' : 'MongoDB connection, required indexes, and transaction-capable topology verified.');
} catch (error) {
  console.error(`MongoDB setup failed (${error.name}). Check the URI, database permissions, Atlas network access, replica-set support, and required indexes. Run db:init first.`);
  process.exitCode = 1;
}

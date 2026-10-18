import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { configIssues } from '../src/config.js';
import { databaseIssues } from '../src/database.js';
import { localEnv, keys, root } from './local-env.js';
const env = localEnv();
const databaseOnly = process.argv.includes('--database-only');
const issues = [...(databaseOnly ? [] : configIssues(env, { setup: true })), ...databaseIssues(env)];
if (!databaseOnly && env.PUBLIC_URL?.includes('YOUR-SUBDOMAIN')) issues.push('Set PUBLIC_URL to your deployed Worker URL first');
if (!databaseOnly && env.PUBLIC_URL && !env.PUBLIC_URL.startsWith('https://')) issues.push('Production PUBLIC_URL must use HTTPS');
if (issues.length) { console.error(issues.join('\n')); process.exit(1); }
// Secrets travel via stdin, never command arguments or a temporary plaintext file.
const selectedKeys = databaseOnly ? ['MONGODB_URI', 'MONGODB_DB_NAME'] : keys;
const secrets = Object.fromEntries(selectedKeys.filter(key => env[key]?.trim()).map(key => [key, env[key]]));
const child = spawn(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'secret', 'bulk'], { cwd: root, stdio: ['pipe', 'inherit', 'inherit'], env: process.env });
child.stdin.on('error', () => {});
child.stdin.end(JSON.stringify(secrets));
child.on('error', () => { console.error('Could not start Wrangler. Run npm install first.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

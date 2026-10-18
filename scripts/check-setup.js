import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { configIssues } from '../src/config.js';
import { localEnv, root } from './local-env.js';
const env = localEnv();
const issues = configIssues(env, { setup: true });
if (!existsSync(resolve(root, '.env'))) issues.unshift('Create .env from .env.example and fill in your configuration');
const config = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8');
if (config.includes('00000000-0000-0000-0000-000000000000')) issues.push('Create a D1 database and replace database_id in wrangler.jsonc');
if (env.PUBLIC_URL?.includes('YOUR-SUBDOMAIN')) issues.push('Replace PUBLIC_URL with your actual deployed Worker URL');
if (issues.length) { console.error('Setup needs attention (values are never printed):\n' + issues.map(issue => `- ${issue}`).join('\n')); process.exitCode = 1; }
else console.log('Core configuration looks valid. Set creator accounts and the verified role with /tiktok setup, /youtube setup, and /getrole, or use .env defaults. Remote secrets, D1 migrations, provider credentials, and live OAuth still need validation.');

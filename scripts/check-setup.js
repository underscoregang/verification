import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { configIssues } from '../src/config.js';
import { databaseIssues } from '../src/database.js';
import { localEnv, root } from './local-env.js';
const env = localEnv();
const issues = [...configIssues(env, { setup: true }), ...databaseIssues(env)];
const selectedFile = process.argv.find(value => value.startsWith('--env-file='))?.slice('--env-file='.length) || process.env.ENV_FILE || '.env';
if (!existsSync(resolve(root, selectedFile))) issues.unshift('Create the selected configuration file from .env.example');
if (env.PUBLIC_URL?.includes('YOUR-SUBDOMAIN')) issues.push('Replace PUBLIC_URL with your actual deployed Worker URL');
if (issues.length) { console.error('Setup needs attention (values are never printed):\n' + issues.map(issue => `- ${issue}`).join('\n')); process.exitCode = 1; }
else console.log('Core configuration looks valid. Run db:init and db:check for MongoDB. Set creator accounts and the verified role with /tiktok setup, /youtube setup, and /getrole, or use .env defaults. Provider credentials and live OAuth still need validation.');

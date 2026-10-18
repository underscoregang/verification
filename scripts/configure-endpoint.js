import { localEnv } from './local-env.js';
const env = localEnv();
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_PUBLIC_KEY', 'PUBLIC_URL']) {
  if (!env[key]?.trim()) { console.error(`Missing ${key}`); process.exit(1); }
}
try {
  const endpoint = new URL('/interactions', env.PUBLIC_URL);
  if (endpoint.protocol !== 'https:') throw new Error('HTTPS required');
  const headers = { Authorization: `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };
  const current = await fetch('https://discord.com/api/v10/applications/@me', { headers, signal: AbortSignal.timeout(15000) });
  if (!current.ok) throw new Error('Could not read application');
  const application = await current.json();
  if (application.id !== env.DISCORD_CLIENT_ID || application.verify_key !== env.DISCORD_PUBLIC_KEY) throw new Error('Application identity mismatch');
  if (application.interactions_endpoint_url === endpoint.href) console.log('Discord interactions endpoint is already configured.');
  else {
    const response = await fetch('https://discord.com/api/v10/applications/@me', {
      method: 'PATCH', headers, body: JSON.stringify({ interactions_endpoint_url: endpoint.href }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) { console.error(`Endpoint setup failed (HTTP ${response.status}). Check the deployed Worker URL and public-key secret.`); process.exit(1); }
    const updated = await response.json();
    if (updated.interactions_endpoint_url !== endpoint.href) throw new Error('Endpoint was not saved');
    console.log('Discord validated and saved the Worker interactions endpoint.');
  }
} catch {
  console.error('Could not configure the interactions endpoint. Check the bot credentials, application/public-key match, HTTPS deployment URL, and network connection.');
  process.exitCode = 1;
}

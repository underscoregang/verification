import { setServers } from 'node:dns';
import { isIP } from 'node:net';

// CLI only. Workers uses Cloudflare's DNS service instead.
export function configureLocalDns(env, applyServers = setServers) {
  const configured = env.MONGODB_DNS_SERVERS ?? '1.1.1.1,8.8.8.8';
  if (!configured.trim()) return;
  const servers = configured.split(',').map(value => value.trim());
  if (servers.some(server => !isIP(server)))
    throw new Error('MONGODB_DNS_SERVERS must be a comma-separated list of IP addresses');
  // Configure once before MongoDB starts any queries.
  applyServers(servers);
}

import { discord } from './client.js';
import { messageCreate, RESULT_TTL } from '../events/client/MessageCreate.js';
import { ready } from '../events/client/Ready.js';

// One named Durable Object owns the Gateway connection for this bot.
// Outbound WebSockets cannot hibernate; the connection incurs duration billing.
export class DiscordGateway {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.socket = null;
    this.sequence = null;
    this.session = null;
    this.connected = false;
    this.acknowledged = true;
    this.nextConnect = 0;
    this.failures = 0;
    this.inflight = 0;
    this.blocked = null;
    ctx.blockConcurrencyWhile(async () => { this.blocked = await ctx.storage.get('blocked') || null; });
  }
  async fetch(request) {
    if (request.method === 'POST') await this.ensureConnected();
    return Response.json({ connected: this.connected, blocked: this.blocked, diagnostic: this.diagnostic || null });
  }
  async alarm() {
    await this.ensureConnected();
    await this.drain();
    await this.cleanup();
  }
  // Result replies are public, so remove them shortly after posting. The stored
  // entry lets the next alarm finish the job if this object restarts first.
  async scheduleDelete(reply) {
    await this.ctx.storage.put(`cleanup:${reply.messageId}`, { ...reply, at: Date.now() + RESULT_TTL });
    setTimeout(() => this.ctx.waitUntil(this.cleanup()), RESULT_TTL);
  }
  async cleanup() {
    const items = await this.ctx.storage.list({ prefix: 'cleanup:', limit: 25 });
    for (const [key, item] of items) {
      if (item.at > Date.now()) continue;
      await discord(this.env, `/channels/${item.channelId}/messages/${item.messageId}`, 'DELETE').catch(error => {
        if (error.status !== 404) console.error('Result message delete failed', error.name, error.status || '');
      });
      await this.ctx.storage.delete(key);
    }
  }
  async enqueue(message) {
    await this.ctx.storage.put(`message:${message.id}`, message);
    await this.drain();
  }
  async drain() {
    if (this.processing) return;
    this.processing = true;
    try {
      // Keep events across restarts and process sequentially to bound AI/DB load.
      for (let batch = 0; batch < 5; batch++) {
        const items = await this.ctx.storage.list({ prefix: 'message:', limit: 5 });
        if (!items.size) break;
        for (const [key, message] of items) {
          try {
            const reply = await messageCreate(message, this.env);
            if (reply) await this.scheduleDelete(reply);
            await this.ctx.storage.delete(key);
          } catch (error) {
            console.error('Gateway message handler failed', error.name);
            return; // Alarm retries after transient database failures.
          }
        }
      }
    } finally { this.processing = false; }
  }
  async ensureConnected() {
    if (this.blocked) return;
    await this.ctx.storage.setAlarm(Date.now() + 60000);
    if (this.socket || this.connecting || Date.now() < this.nextConnect) return;
    this.connecting = true;
    try {
      this.diagnostic = 'gateway_discovery';
      const gateway = this.session ? { url: this.session.resumeUrl } : await discord(this.env, '/gateway/bot');
      if (gateway.session_start_limit?.remaining === 0) {
        this.nextConnect = Date.now() + gateway.session_start_limit.reset_after;
        return;
      }
      const url = new URL(gateway.url);
      if (url.protocol !== 'wss:' || !url.hostname.endsWith('.discord.gg')) throw new Error('Invalid Gateway URL');
      url.protocol = 'https:';
      url.search = '?v=10&encoding=json';
      this.diagnostic = 'websocket_upgrade';
      // Time out only the upgrade itself; a signal still pending later would abort the live socket.
      const upgrade = new AbortController();
      const upgradeTimer = setTimeout(() => upgrade.abort(), 10000);
      let response;
      try { response = await fetch(url, { headers: { Upgrade: 'websocket' }, signal: upgrade.signal }); }
      finally { clearTimeout(upgradeTimer); }
      this.diagnostic = 'upgrade_status_' + response.status;
      const socket = response.webSocket;
      if (!socket) throw new Error('Gateway upgrade failed');
      this.diagnostic = 'awaiting_hello';
      this.socket = socket;
      socket.accept();
      socket.addEventListener('message', event => {
        try { this.packet(JSON.parse(event.data), socket); }
        catch { this.disconnect(socket); }
      });
      socket.addEventListener('close', event => this.ctx.waitUntil(this.closed(socket, event.code)));
      socket.addEventListener('error', () => this.disconnect(socket));
      this.handshake = setTimeout(() => { if (!this.connected) this.disconnect(socket); }, 20000);
    } catch (error) {
      this.diagnostic = (this.diagnostic || 'connect') + ':' + error.name;
      this.nextConnect = Date.now() + Math.min(60000, 5000 * 2 ** Math.min(this.failures++, 4));
    } finally {
      this.connecting = false;
    }
  }
  send(op, d) {
    this.socket?.send(JSON.stringify({ op, d }));
  }
  heartbeat(socket) {
    if (this.socket !== socket) return;
    if (!this.acknowledged) return this.disconnect(socket);
    this.acknowledged = false;
    this.send(1, this.sequence);
  }
  packet(packet, socket) {
    if (this.socket !== socket) return;
    if (packet.s != null) this.sequence = packet.s;
    if (packet.op === 10) {
      this.diagnostic = 'identifying';
      const interval = packet.d.heartbeat_interval;
      if (!Number.isFinite(interval) || interval < 1000) throw new Error('Invalid heartbeat');
      this.acknowledged = true;
      clearTimeout(this.firstHeartbeat);
      clearInterval(this.heartbeatTimer);
      this.firstHeartbeat = setTimeout(() => {
        this.heartbeat(socket);
        this.heartbeatTimer = setInterval(() => this.heartbeat(socket), interval);
      }, Math.random() * interval);
      if (this.session) this.send(6, { token: this.env.DISCORD_TOKEN, session_id: this.session.sessionId, seq: this.sequence });
      else this.send(2, { token: this.env.DISCORD_TOKEN, intents: 1 | 512 | 32768,
        properties: { os: 'linux', browser: 'underscore', device: 'underscore' },
        presence: { status: 'online', activities: [], since: null, afk: false } });
    } else if (packet.op === 11) this.acknowledged = true;
    else if (packet.op === 1) this.send(1, this.sequence);
    else if (packet.op === 7) this.disconnect(socket);
    else if (packet.op === 9) {
      if (!packet.d) { this.session = null; this.sequence = null; }
      this.disconnect(socket);
    } else if (packet.op === 0) {
      if (packet.t === 'READY') {
        this.session = ready(packet.d, this.env.DISCORD_CLIENT_ID);
        this.connected = true;
        this.diagnostic = null;
        this.failures = 0;
        clearTimeout(this.handshake);
      } else if (packet.t === 'RESUMED') {
        this.connected = true;
        this.diagnostic = null;
        this.failures = 0;
        clearTimeout(this.handshake);
      } else if (packet.t === 'MESSAGE_CREATE' && packet.d.guild_id === this.env.DISCORD_GUILD_ID &&
                 !packet.d.author?.bot && !packet.d.webhook_id && packet.d.attachments?.length) {
        this.ctx.waitUntil(this.enqueue(packet.d).catch(error => {
          console.error('Gateway queue failed', error.name);
        }));
      }
    }
  }
  disconnect(socket) {
    if (this.socket !== socket) return;
    try { socket.close(4000, 'Reconnect'); } catch { /* Already closed. */ }
    this.ctx.waitUntil(this.closed(socket, 4000));
  }
  async closed(socket, code) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.connected = false;
    this.diagnostic = 'closed_' + code;
    clearTimeout(this.handshake);
    clearTimeout(this.firstHeartbeat);
    clearInterval(this.heartbeatTimer);
    if ([4004, 4010, 4011, 4012, 4013, 4014].includes(code)) {
      this.blocked = code === 4014 ? 'message_content_intent_required' : 'gateway_configuration_error';
      await this.ctx.storage.put('blocked', this.blocked);
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if ([4007, 4009].includes(code)) { this.session = null; this.sequence = null; }
    this.nextConnect = Date.now() + Math.min(60000, 5000 * 2 ** Math.min(this.failures++, 4)) + Math.random() * 1000;
    await this.ctx.storage.setAlarm(this.nextConnect);
  }
}

export function gateway(env, method = 'GET') {
  const object = env.DISCORD_GATEWAY.get(env.DISCORD_GATEWAY.idFromName(env.DISCORD_CLIENT_ID));
  return object.fetch('https://gateway.internal/', { method });
}

import { hash, randomToken } from './security.js';

export class Store {
  constructor(db) { this.db = db; }
  async settings() {
    const { results } = await this.db.prepare('SELECT key,value FROM settings').all();
    return Object.fromEntries(results.map(({ key, value }) => [key, value]));
  }
  async saveSetting(key, value, actor, previous) {
    if (!['TIKTOK_USERNAME', 'YOUTUBE_CHANNEL_ID', 'VERIFIED_ROLE_ID'].includes(key)) throw new Error('Invalid setting');
    const queries = [this.db.prepare('INSERT INTO settings(key,value,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(key, value, actor, Date.now())];
    if (value !== previous && key !== 'VERIFIED_ROLE_ID') {
      const platform = key === 'YOUTUBE_CHANNEL_ID' ? 'youtube' : 'tiktok';
      queries.push(this.db.prepare(`UPDATE members SET ${platform}=NULL,${platform}_target=NULL`));
      queries.push(this.db.prepare('DELETE FROM sessions'));
      if (platform === 'tiktok') queries.push(this.db.prepare("UPDATE reviews SET status='rejected',reviewer=?,decision_id=NULL WHERE status='pending'").bind(actor));
    }
    await this.db.batch(queries);
  }
  member(id) { return this.db.prepare('SELECT * FROM members WHERE id=?').bind(id).first(); }
  async verify(id, platform, identity, target = null) {
    if (!['youtube', 'tiktok'].includes(platform)) throw new Error('Invalid platform');
    await this.db.prepare(`INSERT INTO members(id, ${platform},${platform}_target) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET ${platform}=excluded.${platform},${platform}_target=excluded.${platform}_target`).bind(id, identity, target).run();
  }
  async session({ stage, user, browser = null }) {
    const token = randomToken();
    await this.db.prepare('INSERT INTO sessions(hash,stage,user,browser,expires) VALUES(?,?,?,?,?)').bind(await hash(token), stage, user, browser, Date.now() + 600000).run();
    return token;
  }
  async consume(token, stage, browser = null) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    // Atomic DELETE RETURNING prevents replay even across Worker instances.
    return this.db.prepare('DELETE FROM sessions WHERE hash=? AND stage=? AND expires>? AND (browser IS NULL OR browser=?) RETURNING *').bind(await hash(token), stage, Date.now(), browser).first();
  }
  async claimInteraction(id) {
    return Boolean(await this.db.prepare('INSERT INTO interactions(id,expires) VALUES(?,?) ON CONFLICT(id) DO NOTHING RETURNING id').bind(id, Date.now() + 900000).first());
  }
  async createReview(id, user, handle, proof, target = null) {
    return this.db.prepare("INSERT INTO reviews(id,user,handle,proof,created_at,target) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING *").bind(id, user, handle, proof, Date.now(), target).first();
  }
  review(id) { return this.db.prepare('SELECT * FROM reviews WHERE id=?').bind(id).first(); }
  async attachReview(id, messageId) {
    await this.db.prepare('UPDATE reviews SET message_id=? WHERE id=?').bind(messageId, id).run();
  }
  async failReview(id) {
    await this.db.prepare("UPDATE reviews SET status='delivery_failed' WHERE id=? AND status='pending' AND message_id IS NULL").bind(id).run();
  }
  async decideReview(id, user, approve, decisionId) {
    const queries = [];
    if (approve) queries.push(this.db.prepare(`INSERT INTO members(id,tiktok,tiktok_target)
      SELECT user,handle,target FROM reviews WHERE id=? AND status='pending'
      ON CONFLICT(id) DO UPDATE SET tiktok=excluded.tiktok,tiktok_target=excluded.tiktok_target`).bind(id));
    queries.push(this.db.prepare("UPDATE reviews SET status=?,reviewer=?,decision_id=? WHERE id=? AND status='pending'").bind(approve ? 'approved' : 'rejected', user, decisionId, id));
    // D1 batch is transactional: duplicate account failures roll back the decision.
    await this.db.batch(queries);
    const review = await this.review(id);
    return review?.decision_id === decisionId ? review : null;
  }
  async cleanup() {
    await this.db.batch([
      this.db.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),
      this.db.prepare('DELETE FROM interactions WHERE expires<?').bind(Date.now()),
      this.db.prepare("UPDATE reviews SET status='delivery_failed' WHERE status='pending' AND message_id IS NULL AND created_at<?").bind(Date.now() - 3600000),
    ]);
  }
}

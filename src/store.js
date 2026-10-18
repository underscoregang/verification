import { hash, randomToken } from './security.js';

const document = value => value ? { ...value, id: value._id } : null;
export class Store {
  constructor(db, client) { this.db = db; this.client = client; }
  async transaction(operation) {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(() => operation(session), {
        readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, timeoutMS: 12000,
      });
    } finally { await session.endSession(); }
  }
  async settings() {
    const items = await this.db.collection('settings').find({}, { projection: { value: 1 } }).toArray();
    const allowed = ['TIKTOK_USERNAME', 'YOUTUBE_CHANNEL_ID', 'VERIFIED_ROLE_ID'];
    return Object.fromEntries(items.filter(item => allowed.includes(item._id)).map(item => [item._id, item.value]));
  }
  async saveSetting(key, value, actor, previous) {
    if (!['TIKTOK_USERNAME', 'YOUTUBE_CHANNEL_ID', 'VERIFIED_ROLE_ID'].includes(key)) throw new Error('Invalid setting');
    await this.transaction(async session => {
      await this.db.collection('settings').updateOne({ _id: key }, { $set: { value, updated_by: actor, updated_at: new Date() } }, { upsert: true, session });
      if (value !== previous && key !== 'VERIFIED_ROLE_ID') {
        const platform = key === 'YOUTUBE_CHANNEL_ID' ? 'youtube' : 'tiktok';
        await this.db.collection('members').updateMany({}, { $unset: { [platform]: '', [`${platform}_target`]: '' } }, { session });
        await this.db.collection('sessions').deleteMany({}, { session });
        if (platform === 'tiktok') await this.db.collection('reviews').updateMany({ status: 'pending' }, { $set: { status: 'rejected', reviewer: actor, decision_id: null } }, { session });
      }
    });
  }
  async member(id) {
    const item = await this.db.collection('members').findOne({ _id: id });
    return item ? { youtube: null, tiktok: null, ...document(item) } : null;
  }
  async verify(id, platform, identity, target = null, session) {
    if (!['youtube', 'tiktok'].includes(platform)) throw new Error('Invalid platform');
    await this.db.collection('members').updateOne({ _id: id }, { $set: { [platform]: identity, [`${platform}_target`]: target } }, { upsert: true, ...(session ? { session } : {}) });
  }
  async session({ stage, user, browser = null }) {
    const token = randomToken();
    await this.db.collection('sessions').insertOne({ _id: await hash(token), stage, user, browser, expires: new Date(Date.now() + 600000) });
    return token;
  }
  async consume(token, stage, browser = null) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    // Atomic removal and an explicit expiry check protect against replay even
    // when MongoDB's asynchronous TTL cleanup has not removed an expired row.
    return this.db.collection('sessions').findOneAndDelete({ _id: await hash(token), stage, expires: { $gt: new Date() }, $or: [{ browser: null }, { browser }] });
  }
  async claimInteraction(id) {
    try {
      await this.db.collection('interactions').insertOne({ _id: id, expires: new Date(Date.now() + 900000) });
      return true;
    } catch (error) { if (error.code === 11000) return false; throw error; }
  }
  async createReview(id, user, handle, proof, target = null) {
    const item = { _id: id, user, handle, proof, target, status: 'pending', message_id: null, created_at: new Date() };
    try { await this.db.collection('reviews').insertOne(item); return document(item); }
    catch (error) { if (error.code === 11000) return null; throw error; }
  }
  async review(id) { return document(await this.db.collection('reviews').findOne({ _id: id })); }
  async attachReview(id, messageId) { await this.db.collection('reviews').updateOne({ _id: id }, { $set: { message_id: messageId } }); }
  async failReview(id) { await this.db.collection('reviews').updateOne({ _id: id, status: 'pending', message_id: null }, { $set: { status: 'delivery_failed' } }); }
  async decideReview(id, user, approve, decisionId) {
    return this.transaction(async session => {
      const review = await this.db.collection('reviews').findOneAndUpdate({ _id: id, status: 'pending' }, {
        $set: { status: approve ? 'approved' : 'rejected', reviewer: user, decision_id: decisionId },
      }, { returnDocument: 'after', session });
      if (!review) return null;
      if (approve) await this.verify(review.user, 'tiktok', review.handle, review.target, session);
      return document(review);
    });
  }
  async cleanup() {
    const now = new Date();
    await this.db.collection('sessions').deleteMany({ expires: { $lte: now } });
    await this.db.collection('interactions').deleteMany({ expires: { $lte: now } });
    await this.db.collection('reviews').updateMany({ status: 'pending', message_id: null, created_at: { $lt: new Date(Date.now() - 3600000) } }, { $set: { status: 'delivery_failed' } });
  }
}

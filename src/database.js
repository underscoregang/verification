import { Store } from "./store.js";

export function databaseIssues(env) {
  const issues = [];
  if (!env.MONGODB_URI?.trim()) issues.push("Missing MONGODB_URI");
  else if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))
    issues.push("MONGODB_URI must start with mongodb:// or mongodb+srv://");
  const name = env.MONGODB_DB_NAME || "underscore_verification";
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(name))
    issues.push(
      "MONGODB_DB_NAME must contain only letters, numbers, underscores, or hyphens",
    );
  return issues;
}
export async function withStore(
  env,
  operation,
  { allowUninitialized = false } = {},
) {
  if (databaseIssues(env).length)
    throw new Error("MongoDB configuration is incomplete");
  // Load the native driver inside the request and never share live sockets
  // across Worker invocations. A request owns and closes its MongoClient.
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(env.MONGODB_URI, {
    appName: "underscore-verification",
    maxPoolSize: 1,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 6000,
    waitQueueTimeoutMS: 5000,
    retryWrites: true,
  });
  try {
    await client.connect();
    const db = client.db(env.MONGODB_DB_NAME || "underscore_verification");
    if (
      !allowUninitialized &&
      !(await db.collection("metadata").findOne({ _id: "schema", version: 1 }))
    )
      throw new Error(
        "Initialize MongoDB indexes with db:init before using the bot",
      );
    return await operation(new Store(db, client));
  } finally {
    await client.close();
  }
}
export async function initializeDatabase(db) {
  // Only string-valued identities are unique; unverified/missing identities
  // must not collide. TTL collections also check expiry in application code.
  await db.collection("members").createIndex(
    { youtube: 1 },
    {
      unique: true,
      partialFilterExpression: { youtube: { $type: "string" } },
      name: "unique_youtube",
    },
  );
  await db.collection("members").createIndex(
    { tiktok: 1 },
    {
      unique: true,
      partialFilterExpression: { tiktok: { $type: "string" } },
      name: "unique_tiktok",
    },
  );
  await db.collection("reviews").createIndex(
    { user: 1 },
    {
      unique: true,
      partialFilterExpression: { status: "pending" },
      name: "one_pending_review",
    },
  );
  await db
    .collection("reviews")
    .createIndex({ status: 1, created_at: 1 }, { name: "review_cleanup" });
  await db
    .collection("sessions")
    .createIndex(
      { expires: 1 },
      { expireAfterSeconds: 0, name: "session_expiry" },
    );
  await db
    .collection("interactions")
    .createIndex(
      { expires: 1 },
      { expireAfterSeconds: 0, name: "interaction_expiry" },
    );
  // Pre-create collections used by transactions for older replica sets.
  for (const name of [
    "settings",
    "members",
    "reviews",
    "sessions",
    "interactions",
  ]) {
    try {
      await db.createCollection(name);
    } catch (error) {
      if (error.code !== 48) throw error;
    }
  }
  await checkDatabase(new Store(db));
  await db
    .collection("metadata")
    .updateOne(
      { _id: "schema" },
      { $set: { version: 1, initialized_at: new Date() } },
      { upsert: true },
    );
}
export async function checkDatabase(store) {
  await store.db.command({ ping: 1 });
  const topology = await store.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid")
    throw new Error(
      "MongoDB replica set or Atlas cluster required for transactions",
    );
  const required = {
    members: ["unique_youtube", "unique_tiktok"],
    reviews: ["one_pending_review"],
    sessions: ["session_expiry"],
    interactions: ["interaction_expiry"],
  };
  for (const [name, names] of Object.entries(required)) {
    const indexes = await store.db.collection(name).listIndexes().toArray();
    if (names.some((name) => !indexes.some((index) => index.name === name)))
      throw new Error("Run npm run db:init to create the MongoDB indexes");
  }
}

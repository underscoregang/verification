CREATE TABLE members (id TEXT PRIMARY KEY, youtube TEXT UNIQUE, tiktok TEXT UNIQUE);
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  handle TEXT NOT NULL,
  proof TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'delivery_failed')),
  reviewer TEXT,
  decision_id TEXT,
  message_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX pending_user ON reviews(user) WHERE status='pending';
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  user TEXT NOT NULL,
  browser TEXT,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE interactions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE INDEX interactions_expiry ON interactions(expires);

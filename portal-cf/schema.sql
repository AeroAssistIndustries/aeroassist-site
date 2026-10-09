-- AeroAssist investor and team portal: Cloudflare D1 database.
-- Run once: Cloudflare dashboard → Storage & Databases → D1 → aeroassist-portal → Console → paste → Execute.
-- Safe to run again: it only creates what is missing.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,            -- lower case
  name          TEXT NOT NULL DEFAULT '',
  portal_id     TEXT NOT NULL UNIQUE,
  role          TEXT CHECK (role IN ('prospect','investor','employee','admin')),
  active        INTEGER NOT NULL DEFAULT 1,
  units         REAL NOT NULL DEFAULT 0,
  since         TEXT,
  invested      REAL NOT NULL DEFAULT 0,
  title         TEXT NOT NULL DEFAULT '',
  pw_hash       TEXT,                            -- base64 PBKDF2-SHA256
  pw_salt       TEXT,
  pw_iter       INTEGER,
  totp_secret   TEXT,                            -- encrypted with FILE_KEY
  totp_last     INTEGER NOT NULL DEFAULT 0,      -- last accepted time step (no replays)
  recovery      TEXT NOT NULL DEFAULT '[]',      -- JSON array of SHA-256 hashes
  failed        INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0,
  last_signin   INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash     TEXT PRIMARY KEY,                  -- SHA-256 of the cookie value
  user_id     TEXT NOT NULL,
  stage       TEXT NOT NULL,                     -- 'code', 'enroll' or 'ok'
  via_link    INTEGER NOT NULL DEFAULT 0,        -- 1 when started from a one-time link (required to set up an authenticator)
  pending     TEXT,                              -- encrypted secret while setting up an authenticator
  tries       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  ip          TEXT NOT NULL DEFAULT '',
  ua          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS links (
  token_hash  TEXT PRIMARY KEY,                  -- SHA-256 of the one-time sign-up link token
  user_id     TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  grp          TEXT NOT NULL CHECK (grp IN ('company','investors','holders','team','admin','personal')),
  user_id      TEXT,
  category     TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  doc_date     TEXT,
  file_name    TEXT NOT NULL DEFAULT '',
  r2_key       TEXT NOT NULL UNIQUE,
  mime         TEXT NOT NULL DEFAULT 'application/octet-stream',
  size         INTEGER NOT NULL DEFAULT 0,
  sha256       TEXT NOT NULL DEFAULT '',
  uploaded_by  TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_grp ON documents (grp);
CREATE INDEX IF NOT EXISTS documents_user ON documents (user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  tx_date     TEXT,
  type        TEXT NOT NULL DEFAULT '',
  units       REAL NOT NULL DEFAULT 0,
  amount      REAL NOT NULL DEFAULT 0,
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_user ON transactions (user_id);

CREATE TABLE IF NOT EXISTS settings (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  data  TEXT NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO settings (id, data) VALUES (1, '{}');

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT,
  doc_id      INTEGER,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  ua          TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_user ON activity (user_id);
CREATE INDEX IF NOT EXISTS activity_time ON activity (created_at);

-- Sign-in attempts per IP address, for rate limiting.
CREATE TABLE IF NOT EXISTS throttle (
  key         TEXT PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  window      INTEGER NOT NULL
);

-- The owner-only raise tracker. Each row is one person, encrypted with FILE_KEY. (The worker also creates this table on first use.)
CREATE TABLE IF NOT EXISTS raise_people (
  id          TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

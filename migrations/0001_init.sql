-- Captains: a name and a four-digit PIN, hashed. No email, no reset.
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    NOT NULL,
  username_lc  TEXT    NOT NULL UNIQUE,
  pin_hash     TEXT    NOT NULL,
  salt         TEXT    NOT NULL,
  -- Wrong PINs in a row; five locks the account for a while.
  failed       INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username   TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

-- Lifetime record on the open sea.
CREATE TABLE stats (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sinkings     INTEGER NOT NULL DEFAULT 0,
  deaths       INTEGER NOT NULL DEFAULT 0,
  best_plunder REAL    NOT NULL DEFAULT 0
);

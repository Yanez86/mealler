-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v0.1 initial schema

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  locale TEXT NOT NULL DEFAULT 'it',
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  active INTEGER NOT NULL DEFAULT 1,
  last_seen_version TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE invites (
  token TEXT PRIMARY KEY,
  email TEXT,
  expires_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  time TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 127,
  position INTEGER NOT NULL DEFAULT 0,
  reminder_enabled INTEGER NOT NULL DEFAULT 1,
  reminder_delay_min INTEGER NOT NULL DEFAULT 15,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX slots_user ON slots (user_id, archived, position);

CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES slots (id),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity TEXT,
  kcal REAL,
  protein REAL,
  carbs REAL,
  fat REAL,
  fiber REAL,
  detail TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  calc_status TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX entries_user_date ON entries (user_id, date);

CREATE TABLE thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  nutrient TEXT NOT NULL,
  min REAL,
  max REAL,
  valid_from TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX thresholds_user ON thresholds (user_id, nutrient, valid_from);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

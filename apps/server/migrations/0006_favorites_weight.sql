-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v0.5: favorites, weight diary with reminders

CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity TEXT,
  kcal REAL,
  protein REAL,
  carbs REAL,
  fat REAL,
  fiber REAL,
  detail TEXT,
  slot_id INTEGER REFERENCES slots (id) ON DELETE SET NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX favorites_user ON favorites (user_id);

CREATE TABLE weights (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kg REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE users ADD COLUMN weight_reminder_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN weight_reminder_weeks INTEGER NOT NULL DEFAULT 2;
ALTER TABLE users ADD COLUMN weight_reminder_weekday INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN weight_reminder_time TEXT NOT NULL DEFAULT '07:30';
ALTER TABLE users ADD COLUMN weight_reminder_last_sent TEXT;

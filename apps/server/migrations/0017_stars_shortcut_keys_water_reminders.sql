-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.6.1: library foods starred by each user, keys for the iPhone water shortcut, water reminders

-- A star is personal: the library is shared, the stars are not.
CREATE TABLE product_stars (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, product_id)
);

-- A key lets a shortcut add water for its user, and nothing else. Only its hash is kept.
CREATE TABLE shortcut_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);
CREATE INDEX shortcut_keys_user ON shortcut_keys (user_id);

ALTER TABLE users ADD COLUMN water_reminder_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN water_reminder_hours INTEGER NOT NULL DEFAULT 2;
ALTER TABLE users ADD COLUMN water_reminder_start TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE users ADD COLUMN water_reminder_end TEXT NOT NULL DEFAULT '21:00';
ALTER TABLE users ADD COLUMN water_reminder_last_sent TEXT;

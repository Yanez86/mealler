-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v0.2: push notifications and slot reminders

ALTER TABLE users ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN quiet_start TEXT;
ALTER TABLE users ADD COLUMN quiet_end TEXT;
ALTER TABLE users ADD COLUMN reminders_paused_until TEXT;

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- One reminder per slot per day at most.
CREATE TABLE reminder_log (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES slots (id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot_id, date)
);

-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.4: achievements, kept once unlocked even if the data that earned them is later deleted

CREATE TABLE achievements (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

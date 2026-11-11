-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.6.0: water drunk during the day, and favorites made of several foods

-- One row per drink (a tap on "+ Glass"); the day's total is their sum, and "−" removes the latest.
CREATE TABLE water (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ml INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX water_user_date ON water (user_id, date);

ALTER TABLE users ADD COLUMN water_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN water_goal_ml INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE users ADD COLUMN water_glass_ml INTEGER NOT NULL DEFAULT 250;

-- JSON list of the foods of a favorite meal (one diary entry each when used). NULL for a favorite
-- saved from a single food, which keeps its values in the row as before.
ALTER TABLE favorites ADD COLUMN foods TEXT;

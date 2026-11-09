-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v0.4: in-app estimates with the Anthropic API, meal photos, usage accounting

ALTER TABLE entries ADD COLUMN photo_id TEXT;
ALTER TABLE entries ADD COLUMN calc_error TEXT;

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX photos_user ON photos (user_id);

CREATE TABLE ai_usage (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month, model)
);

-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v0.4.1: daily limits for in-app estimates

CREATE TABLE ai_usage_daily (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

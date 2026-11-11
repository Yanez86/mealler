-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.5: one-time links to set a new password, made by an administrator or from the server's command line

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

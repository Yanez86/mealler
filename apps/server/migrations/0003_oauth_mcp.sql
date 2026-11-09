-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v0.3: OAuth 2.1 authorization server for the claude.ai connector (MCP)

CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);
CREATE INDEX oauth_tokens_user ON oauth_tokens (user_id);

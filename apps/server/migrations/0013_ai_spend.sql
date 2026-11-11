-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.5: what the instance spent on the Anthropic API, per UTC month.
-- Kept apart from ai_usage, whose rows go away with the account: the instance budget must not.

CREATE TABLE ai_spend (
  month TEXT PRIMARY KEY,
  cost_usd REAL NOT NULL DEFAULT 0
);
INSERT INTO ai_spend (month, cost_usd) SELECT month, sum(cost_usd) FROM ai_usage GROUP BY month;

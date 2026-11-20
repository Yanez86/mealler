-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.7.0: meals off the diary. The user ate but did not log it (a wedding, a big dinner): the
-- meal counts as filled and gets no reminder, and the day's totals are known only from below, so the
-- day stays out of averages and of "days in range". Entries can sit beside the mark (what is known).

CREATE TABLE untracked_meals (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES slots (id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  -- How much, roughly: light, normal, large, huge; NULL when not said.
  size TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot_id, date)
);

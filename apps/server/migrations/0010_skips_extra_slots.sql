-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.2: meals marked as skipped, and slots added for a single day

CREATE TABLE slot_skips (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES slots (id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot_id, date)
);

-- A meal logged in a skipped slot means it was not skipped after all, whatever way it was logged.
CREATE TRIGGER entries_unskip_insert AFTER INSERT ON entries BEGIN
  DELETE FROM slot_skips WHERE user_id = NEW.user_id AND slot_id = NEW.slot_id AND date = NEW.date;
END;
CREATE TRIGGER entries_unskip_update AFTER UPDATE OF slot_id, date ON entries BEGIN
  DELETE FROM slot_skips WHERE user_id = NEW.user_id AND slot_id = NEW.slot_id AND date = NEW.date;
END;

-- A slot with a date exists on that day only (an extra meal); NULL is a regular slot.
ALTER TABLE slots ADD COLUMN date TEXT;

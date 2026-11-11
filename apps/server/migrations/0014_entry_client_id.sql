-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.5: an id chosen by the device for each new entry, so one sent twice
-- (offline queue, lost answer) is saved, and estimated, only once.

ALTER TABLE entries ADD COLUMN client_id TEXT;
CREATE UNIQUE INDEX entries_client_id ON entries (user_id, client_id) WHERE client_id IS NOT NULL;

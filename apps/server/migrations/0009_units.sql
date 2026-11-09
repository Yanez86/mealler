-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.1.3: metric or US customary units for food quantities and body weight (data stays metric)

ALTER TABLE users ADD COLUMN units TEXT NOT NULL DEFAULT 'metric';

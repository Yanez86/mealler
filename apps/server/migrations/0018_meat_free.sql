-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.6.3: "Meat-free" shows legumes and vegetables instead of animals in the app's pictures

ALTER TABLE users ADD COLUMN meat_free INTEGER NOT NULL DEFAULT 0;

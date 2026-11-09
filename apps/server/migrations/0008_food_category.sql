-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.1: food category chosen by the user (NULL = guessed from the name)

ALTER TABLE entries ADD COLUMN category TEXT;
ALTER TABLE favorites ADD COLUMN category TEXT;
ALTER TABLE products ADD COLUMN category TEXT;

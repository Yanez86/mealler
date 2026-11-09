-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v1.3.0: a photo of the nutrition label per library food (file in <data>/labels/<id>, mime here)

ALTER TABLE products ADD COLUMN label_mime TEXT;

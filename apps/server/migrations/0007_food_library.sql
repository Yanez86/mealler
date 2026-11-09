-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Mealler v0.6: shared food library (packaged products, values per 100 g)

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT UNIQUE,
  kcal REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  fiber REAL,
  serving_g REAL,
  serving_label TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX products_name ON products (name COLLATE NOCASE);

ALTER TABLE entries ADD COLUMN product_id INTEGER REFERENCES products (id) ON DELETE SET NULL;
ALTER TABLE entries ADD COLUMN amount_g REAL;

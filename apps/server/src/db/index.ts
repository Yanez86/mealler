// SPDX-License-Identifier: AGPL-3.0-or-later
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema.ts';

export type Db = BetterSQLite3Database<typeof schema>;

export interface OpenDatabase {
  sqlite: Database.Database;
  db: Db;
}

export function openDatabase(dataDir: string, fileName = 'mealler.db'): OpenDatabase {
  const path = fileName === ':memory:' ? ':memory:' : join(dataDir, fileName);
  if (path !== ':memory:') mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Applies every migrations/NNNN_*.sql file not yet recorded, each in its own transaction. */
export function migrate(sqlite: Database.Database, migrationsDir: string): string[] {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`
  );
  const applied = new Set(
    (sqlite.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name)
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    })();
    done.push(file);
  }
  return done;
}

export { schema };

// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadConfig } from './config.ts';
import { migrate, openDatabase } from './db/index.ts';
import { buildApp } from './app.ts';
import { createPushSender } from './push.ts';
import { startReminderScheduler } from './reminders.ts';

const config = loadConfig();
const { sqlite, db } = openDatabase(config.dataDir);
const applied = migrate(sqlite, config.migrationsDir);

const push = createPushSender(db, config);
const app = await buildApp({ db, config, push });
const stopReminders = startReminderScheduler(db, push, app.log);
if (applied.length) app.log.info({ applied }, 'database migrations applied');

const shutdown = async (signal: string) => {
  app.log.info(`received ${signal}, shutting down`);
  stopReminders();
  await app.close();
  sqlite.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`Mealler ${config.version} listening on ${config.host}:${config.port}`);

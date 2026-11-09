// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadConfig } from './config.ts';
import { migrate, openDatabase } from './db/index.ts';
import { buildApp } from './app.ts';
import { createPushSender } from './push.ts';
import { startReminderScheduler } from './reminders.ts';
import { anthropicFetch, startPendingWorker } from './ai.ts';
import { createSecretBox, loadSecretKey } from './secrets.ts';
import { openFoodFactsLookup } from './foods.ts';
import { users } from './db/schema.ts';
import { eq } from 'drizzle-orm';

const config = loadConfig();
const { sqlite, db } = openDatabase(config.dataDir);
const applied = migrate(sqlite, config.migrationsDir);

const push = createPushSender(db, config);
const aiBase = { db, secrets: createSecretBox(loadSecretKey(config.dataDir)), call: anthropicFetch, dataDir: config.dataDir };
let kick = () => {};
const foods = { lookup: openFoodFactsLookup(config.version) };
const app = await buildApp({ db, config, push, ai: { ...aiBase, kick: () => kick() }, foods });
const worker = startPendingWorker(aiBase, (id) => db.select().from(users).where(eq(users.id, id)).get(), app.log);
kick = worker.kick;
const stopReminders = startReminderScheduler(db, push, app.log);
if (applied.length) app.log.info({ applied }, 'database migrations applied');

const shutdown = async (signal: string) => {
  app.log.info(`received ${signal}, shutting down`);
  stopReminders();
  worker.stop();
  await app.close();
  sqlite.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`Mealler ${config.version} listening on ${config.host}:${config.port}`);

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
import { createPasswordReset } from './auth.ts';
import { findUserByEmail } from './services.ts';

const config = loadConfig();
const { sqlite, db } = openDatabase(config.dataDir);
const applied = migrate(sqlite, config.migrationsDir);

// When nobody can sign in as administrator any more:
//   docker exec mealler node dist/index.js reset-password nome@esempio.it
// prints a one-time link to set a new password, next to the running server.
if (process.argv[2] === 'reset-password') {
  const user = findUserByEmail(db, process.argv[3] ?? '');
  if (!user) {
    console.error('Nessun account con questo indirizzo email. / No account with this email address.');
    process.exit(1);
  }
  const link = `${config.baseUrl ?? 'http://INDIRIZZO-DI-MEALLER'}/reset?token=${createPasswordReset(db, user.id)}`;
  console.log(`Link per scegliere una nuova password, valido 24 ore / Link to set a new password, valid 24 hours:\n${link}`);
  process.exit(0);
}

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

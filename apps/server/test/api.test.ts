// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { migrate, openDatabase } from '../src/db/index.ts';
import type { PushSender } from '../src/push.ts';
import { runReminderTick } from '../src/reminders.ts';
import type { PushPayload } from '@mealler/shared';

async function setupApp() {
  const config = {
    ...loadConfig({}),
    publicDir: '/nonexistent',
    migrationsDir: fileURLToPath(new URL('../migrations', import.meta.url))
  };
  const { sqlite, db } = openDatabase('', ':memory:');
  migrate(sqlite, config.migrationsDir);
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const push: PushSender = {
    publicKey: 'test-key',
    async send(target, payload) {
      sent.push({ endpoint: target.endpoint, payload });
      return target.endpoint.includes('gone') ? 'gone' : 'ok';
    }
  };
  const app = await buildApp({ db, config, push }, { logger: false });
  return { app, db, push, sent };
}

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : String(raw);
  return first.split(';')[0];
}

const admin = { name: 'Admin', email: 'Admin@Example.com', password: 'correct horse battery', locale: 'it', timezone: 'Europe/Rome' };

test('setup, login, slots, entries, day view and isolation', async () => {
  const { app } = await setupApp();

  let res = await app.inject({ method: 'GET', url: '/api/status' });
  assert.equal(res.json().setupRequired, true);

  res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().role, 'admin');
  assert.equal(res.json().email, 'admin@example.com');
  const adminCookie = cookieOf(res);

  // A second setup is refused.
  res = await app.inject({ method: 'POST', url: '/api/setup', payload: { ...admin, email: 'x@example.com' } });
  assert.equal(res.statusCode, 403);

  // Unauthenticated access is refused.
  res = await app.inject({ method: 'GET', url: '/api/slots' });
  assert.equal(res.statusCode, 401);

  // Default slots exist.
  res = await app.inject({ method: 'GET', url: '/api/slots', headers: { cookie: adminCookie } });
  const slots = res.json();
  assert.equal(slots.length, 5);
  assert.equal(slots[0].name, 'Colazione');

  // Login with wrong and right passwords.
  res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: admin.email, password: 'nope' } });
  assert.equal(res.statusCode, 401);
  res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: admin.email, password: admin.password } });
  assert.equal(res.statusCode, 200);

  // Add an entry and read the day.
  res = await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: { cookie: adminCookie },
    payload: { slotId: slots[0].id, date: '2026-11-09', description: 'Yogurt', kcal: 150, protein: 6, carbs: 18, fat: 6 }
  });
  assert.equal(res.statusCode, 200, res.body);
  const entry = res.json();
  assert.equal(entry.kcalMismatch, false);

  res = await app.inject({
    method: 'PUT',
    url: '/api/thresholds',
    headers: { cookie: adminCookie },
    payload: { items: [{ nutrient: 'protein', min: 90, max: null }] }
  });
  assert.equal(res.statusCode, 200, res.body);

  res = await app.inject({ method: 'GET', url: '/api/day/2026-11-09', headers: { cookie: adminCookie } });
  const day = res.json();
  assert.equal(day.summary.kcal.value, 150);
  assert.equal(day.summary.kcal.status, 'none');
  assert.equal(day.slots[0].entries.length, 1);

  // Invite a second user; they cannot see the admin's entry.
  res = await app.inject({ method: 'POST', url: '/api/admin/invites', headers: { cookie: adminCookie }, payload: { days: 3 } });
  assert.equal(res.statusCode, 200, res.body);
  const { token } = res.json();
  res = await app.inject({
    method: 'POST',
    url: '/api/register',
    payload: { token, name: 'Bob', email: 'bob@example.com', password: 'another long password', locale: 'en' }
  });
  assert.equal(res.statusCode, 200, res.body);
  const bobCookie = cookieOf(res);

  res = await app.inject({ method: 'GET', url: `/api/entries/${entry.id}`, headers: { cookie: bobCookie } });
  assert.equal(res.statusCode, 404);
  res = await app.inject({ method: 'DELETE', url: `/api/entries/${entry.id}`, headers: { cookie: bobCookie } });
  res = await app.inject({ method: 'GET', url: `/api/entries/${entry.id}`, headers: { cookie: adminCookie } });
  assert.equal(res.statusCode, 200);
  res = await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: { cookie: bobCookie },
    payload: { slotId: slots[0].id, date: '2026-11-09', description: 'Not my slot' }
  });
  assert.equal(res.statusCode, 400);

  // Non-admins cannot reach admin routes; the invite is single-use.
  res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: bobCookie } });
  assert.equal(res.statusCode, 403);
  res = await app.inject({
    method: 'POST',
    url: '/api/register',
    payload: { token, name: 'Eve', email: 'eve@example.com', password: 'yet another password' }
  });
  assert.equal(res.statusCode, 403);

  // The only admin cannot be demoted.
  const me = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: adminCookie } })).json();
  res = await app.inject({ method: 'PATCH', url: `/api/admin/users/${me.id}`, headers: { cookie: adminCookie }, payload: { role: 'user' } });
  assert.equal(res.statusCode, 400);

  await app.close();
});

test('slot reminders respect time, filled slots, quiet hours and pauses', async () => {
  const { app, db, push, sent } = await setupApp();
  let res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  const cookie = cookieOf(res);
  const headers = { cookie };
  const slots = (await app.inject({ method: 'GET', url: '/api/slots', headers })).json();
  const breakfast = slots[0];
  // Only breakfast reminds, 15 minutes after 08:00.
  for (const s of slots.slice(1)) {
    await app.inject({ method: 'PATCH', url: `/api/slots/${s.id}`, headers, payload: { reminderEnabled: false } });
  }
  await app.inject({ method: 'PATCH', url: `/api/slots/${breakfast.id}`, headers, payload: { reminderDelayMin: 15 } });

  // No devices yet: nothing is sent.
  assert.equal(await runReminderTick(db, push, new Date('2026-11-09T07:20:00Z')), 0);

  res = await app.inject({
    method: 'POST',
    url: '/api/push/subscribe',
    headers,
    payload: { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256dh-key-0123456789', auth: 'auth-key-0123' } }
  });
  assert.equal(res.statusCode, 200, res.body);

  // 08:10 in Rome: too early.
  assert.equal(await runReminderTick(db, push, new Date('2026-11-09T07:10:00Z')), 0);
  // 08:20 in Rome: due.
  assert.equal(await runReminderTick(db, push, new Date('2026-11-09T07:20:00Z')), 1);
  assert.equal(sent.at(-1)?.payload.url, `/add?slot=${breakfast.id}&d=2026-11-09`);
  // Never twice on the same day.
  assert.equal(await runReminderTick(db, push, new Date('2026-11-09T07:30:00Z')), 0);

  // A filled slot does not remind.
  await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers,
    payload: { slotId: breakfast.id, date: '2026-11-10', description: 'Caffè' }
  });
  assert.equal(await runReminderTick(db, push, new Date('2026-11-10T07:20:00Z')), 0);

  // Quiet hours block it, and so does a pause.
  await app.inject({ method: 'PATCH', url: '/api/me', headers, payload: { quietStart: '08:00', quietEnd: '09:00' } });
  assert.equal(await runReminderTick(db, push, new Date('2026-11-11T07:20:00Z')), 0);
  await app.inject({ method: 'PATCH', url: '/api/me', headers, payload: { quietStart: null, quietEnd: null, remindersPausedUntil: '2026-11-12' } });
  assert.equal(await runReminderTick(db, push, new Date('2026-11-12T07:20:00Z')), 0);
  assert.equal(await runReminderTick(db, push, new Date('2026-11-13T07:20:00Z')), 1);

  // Too late (more than 3 hours after): skipped.
  assert.equal(await runReminderTick(db, push, new Date('2026-11-14T11:30:00Z')), 0);

  // Expired subscriptions are removed.
  await app.inject({
    method: 'POST',
    url: '/api/push/subscribe',
    headers,
    payload: { endpoint: 'https://push.example.com/gone', keys: { p256dh: 'p256dh-key-0123456789', auth: 'auth-key-0123' } }
  });
  res = await app.inject({ method: 'POST', url: '/api/push/test', headers });
  assert.equal(res.json().delivered, 1);
  res = await app.inject({ method: 'POST', url: '/api/push/test', headers });
  assert.equal(sent.filter((s) => s.endpoint.endsWith('/gone')).length, 1);

  await app.close();
});

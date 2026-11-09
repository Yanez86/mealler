// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { migrate, openDatabase } from '../src/db/index.ts';

async function setupApp() {
  const config = {
    ...loadConfig({}),
    publicDir: '/nonexistent',
    migrationsDir: fileURLToPath(new URL('../migrations', import.meta.url))
  };
  const { sqlite, db } = openDatabase('', ':memory:');
  migrate(sqlite, config.migrationsDir);
  const app = await buildApp({ db, config }, { logger: false });
  return app;
}

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : String(raw);
  return first.split(';')[0];
}

const admin = { name: 'Admin', email: 'Admin@Example.com', password: 'correct horse battery', locale: 'it', timezone: 'Europe/Rome' };

test('setup, login, slots, entries, day view and isolation', async () => {
  const app = await setupApp();

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

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
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { processPendingEntries, type AnthropicCall, type AnthropicResponse } from '../src/ai.ts';
import { createSecretBox } from '../src/secrets.ts';
import { users } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function setupApp(publicDir = '/nonexistent') {
  const config = {
    ...loadConfig({}),
    publicDir,
    updateCheck: false,
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
  const calls: Record<string, unknown>[] = [];
  let nextResponse: AnthropicResponse | null = null;
  const call: AnthropicCall = async (_key, body) => {
    calls.push(body);
    if (nextResponse) {
      const r = nextResponse;
      nextResponse = null;
      return r;
    }
    return {
      status: 200,
      body: {
        content: [
          {
            type: 'tool_use',
            name: 'record_estimate',
            input: {
              description: 'Yogurt bianco e biscotti',
              items: [
                { name: 'Yogurt bianco', quantity: '125 g', kcal: 80, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
                { name: 'Biscotti secchi', quantity: '2', kcal: 70, protein: 1.2, carbs: 12, fat: 1.8, fiber: 0.5 }
              ],
              confidence: 'medium',
              notes: 'Porzioni tipiche'
            }
          }
        ],
        usage: { input_tokens: 1000, output_tokens: 300 }
      }
    };
  };
  const ai = {
    db,
    secrets: createSecretBox(randomBytes(32)),
    call,
    dataDir: mkdtempSync(join(tmpdir(), 'mealler-test-')),
    kick: () => {}
  };
  const foods = {
    lookup: async (barcode: string) =>
      barcode === '8013355998702'
        ? {
            name: 'Tarallini classici',
            brand: 'Gran Pavesi',
            barcode,
            kcal: 474,
            protein: 9.4,
            carbs: 63,
            fat: 20,
            fiber: 3.5,
            servingG: 32,
            servingLabel: '1 pacchetto (32 g)',
            source: 'openfoodfacts' as const
          }
        : null
  };
  const app = await buildApp({ db, config, push, ai, foods }, { logger: false });
  return { app, db, sqlite, push, sent, ai, calls, respondNext: (r: AnthropicResponse) => (nextResponse = r) };
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

test('claude.ai connector: OAuth 2.1 with PKCE, MCP tools, isolation, refresh and revoke', async () => {
  const { createHash } = await import('node:crypto');
  const { app } = await setupApp();
  let res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  const adminCookie = cookieOf(res);
  const asAdmin = { cookie: adminCookie };

  // Disabled by default: discovery and MCP are hidden.
  res = await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' });
  assert.equal(res.statusCode, 404);
  res = await app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0', id: 1, method: 'ping' } });
  assert.equal(res.statusCode, 404);

  res = await app.inject({ method: 'PATCH', url: '/api/admin/settings', headers: asAdmin, payload: { mcpEnabled: true } });
  assert.equal(res.json().mcpEnabled, true);

  // Unauthenticated MCP call points to the protected-resource metadata.
  res = await app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0', id: 1, method: 'ping' } });
  assert.equal(res.statusCode, 401);
  assert.match(String(res.headers['www-authenticate']), /resource_metadata=".*\/\.well-known\/oauth-protected-resource"/);

  res = await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' });
  assert.equal(res.statusCode, 200);
  res = await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' });
  const meta = res.json();
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);

  // Dynamic client registration.
  const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
  res = await app.inject({
    method: 'POST',
    url: '/oauth/register',
    payload: { client_name: 'Claude', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }
  });
  assert.equal(res.statusCode, 201, res.body);
  const clientId = res.json().client_id;
  res = await app.inject({ method: 'POST', url: '/oauth/register', payload: { redirect_uris: ['http://evil.example.com/cb'] } });
  assert.equal(res.statusCode, 400);

  // Authorization request with PKCE.
  const verifier = 'v'.repeat(64);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const params = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz'
  };
  const qs = new URLSearchParams(params).toString();
  res = await app.inject({ method: 'GET', url: `/oauth/authorize?${qs}` });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, `/consent?${qs}`);
  res = await app.inject({ method: 'GET', url: `/oauth/authorize?${qs.replace('claude.ai', 'evil.example.com')}` });
  assert.equal(res.statusCode, 400);

  res = await app.inject({ method: 'GET', url: `/api/oauth/request?${qs}`, headers: asAdmin });
  assert.equal(res.json().clientName, 'Claude');
  res = await app.inject({ method: 'POST', url: '/api/oauth/decision', headers: asAdmin, payload: { approve: true, params } });
  const redirect = new URL(res.json().redirect);
  assert.equal(redirect.searchParams.get('state'), 'xyz');
  const code = redirect.searchParams.get('code')!;

  const form = (body: Record<string, string>) => ({
    method: 'POST' as const,
    url: '/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(body).toString()
  });

  // Wrong verifier fails, and burns the code.
  res = await app.inject(form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: 'w'.repeat(64) }));
  assert.equal(res.statusCode, 400);
  res = await app.inject(form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }));
  assert.equal(res.statusCode, 400);

  // Fresh code, correct verifier.
  res = await app.inject({ method: 'POST', url: '/api/oauth/decision', headers: asAdmin, payload: { approve: true, params } });
  const code2 = new URL(res.json().redirect).searchParams.get('code')!;
  res = await app.inject(form({ grant_type: 'authorization_code', code: code2, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }));
  assert.equal(res.statusCode, 200, res.body);
  const tokens = res.json();
  assert.equal(tokens.token_type, 'Bearer');

  const mcp = (body: unknown, token = tokens.access_token) =>
    app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${token}` }, payload: body as object });

  res = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  assert.equal(res.json().result.protocolVersion, '2025-06-18');
  assert.match(res.json().result.instructions, /Europe\/Rome/);
  res = await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(res.statusCode, 202);
  res = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = res.json().result.tools.map((t: { name: string }) => t.name);
  assert.deepEqual(names.sort(), ['add_entry', 'delete_entry', 'get_day', 'get_summary', 'get_thresholds', 'get_weights', 'list_slots', 'log_food', 'log_weight', 'search_foods', 'update_entry']);

  res = await mcp({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'add_entry',
      arguments: {
        date: '2026-11-09',
        slot_name: 'pranzo',
        description: 'Pasta al pomodoro e insalata',
        items: [
          { name: 'Pasta al pomodoro', quantity: '120 g', kcal: 520, protein: 16, carbs: 95, fat: 8 },
          { name: 'Insalata con olio', kcal: 120, protein: 2, carbs: 5, fat: 10, fiber: 3 }
        ]
      }
    }
  });
  const added = res.json().result;
  assert.equal(added.isError, undefined, JSON.stringify(added));
  assert.equal(added.structuredContent.logged.kcal, 640);
  res = await mcp({
    jsonrpc: '2.0',
    id: 31,
    method: 'tools/call',
    params: { name: 'update_entry', arguments: { entry_id: added.structuredContent.entry_id, category: 'pasta' } }
  });
  assert.equal(res.json().result.structuredContent.entry.category, 'pasta');
  assert.equal(added.structuredContent.slot, 'Pranzo');

  res = await mcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'add_entry', arguments: { description: 'x', slot_name: 'Brunch' } } });
  assert.equal(res.json().result.isError, true);
  assert.match(res.json().result.content[0].text, /Colazione/);

  res = await mcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_summary', arguments: { from: '2026-11-03', to: '2026-11-09' } } });
  assert.equal(res.json().result.structuredContent.averages.kcal, 640);

  // The web diary shows the entry as a Claude estimate.
  res = await app.inject({ method: 'GET', url: '/api/day/2026-11-09', headers: asAdmin });
  const lunch = res.json().slots.find((s: { slot: { name: string } }) => s.slot.name === 'Pranzo');
  assert.equal(lunch.entries[0].source, 'claude_ai');

  // Another user's token cannot reach this entry.
  res = await app.inject({ method: 'POST', url: '/api/admin/invites', headers: asAdmin, payload: {} });
  res = await app.inject({ method: 'POST', url: '/api/register', payload: { token: res.json().token, name: 'Bob', email: 'bob@example.com', password: 'another long password' } });
  const bob = { cookie: cookieOf(res) };
  res = await app.inject({ method: 'POST', url: '/api/oauth/decision', headers: bob, payload: { approve: true, params } });
  const bobCode = new URL(res.json().redirect).searchParams.get('code')!;
  res = await app.inject(form({ grant_type: 'authorization_code', code: bobCode, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }));
  const bobToken = res.json().access_token;
  res = await mcp({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'delete_entry', arguments: { entry_id: added.structuredContent.entry_id } } }, bobToken);
  assert.equal(res.json().result.isError, true);

  // Refresh rotates the tokens.
  res = await app.inject(form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }));
  assert.equal(res.statusCode, 200, res.body);
  const rotated = res.json();
  res = await app.inject(form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }));
  assert.equal(res.statusCode, 400);
  res = await mcp({ jsonrpc: '2.0', id: 7, method: 'ping' }, tokens.access_token);
  assert.equal(res.statusCode, 401);
  res = await mcp({ jsonrpc: '2.0', id: 8, method: 'ping' }, rotated.access_token);
  assert.equal(res.statusCode, 200);

  // The user sees and revokes the connection from the web app.
  res = await app.inject({ method: 'GET', url: '/api/oauth/connections', headers: asAdmin });
  assert.equal(res.json().length, 1);
  await app.inject({ method: 'DELETE', url: `/api/oauth/connections/${clientId}`, headers: asAdmin });
  res = await mcp({ jsonrpc: '2.0', id: 9, method: 'ping' }, rotated.access_token);
  assert.equal(res.statusCode, 401);

  await app.close();
});

test('in-app estimates: settings, encryption, photos, background calculation and spending cap', async () => {
  const { app, db, sqlite, ai, calls, respondNext } = await setupApp();
  let res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  const asAdmin = { cookie: cookieOf(res) };
  const slots = (await app.inject({ method: 'GET', url: '/api/slots', headers: asAdmin })).json();

  // Disabled by default.
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers: asAdmin, payload: { description: 'yogurt' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, 'aiDisabled');

  res = await app.inject({
    method: 'PATCH',
    url: '/api/admin/ai',
    headers: asAdmin,
    payload: { enabled: true, apiKey: 'sk-ant-test-key-1234', keepPhotos: true }
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().hasKey, true);
  assert.equal(res.json().keyHint, '…1234');
  assert.equal(res.json().apiKey, undefined);
  const stored = sqlite.prepare("SELECT value FROM settings WHERE key = 'ai_api_key'").get() as { value: string };
  assert.ok(!stored.value.includes('sk-ant'), 'API key must be encrypted at rest');

  // Text estimate.
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers: asAdmin, payload: { description: 'yogurt e 2 biscotti' } });
  assert.equal(res.statusCode, 200, res.body);
  const { estimate } = res.json();
  assert.equal(estimate.totals.kcal, 150);
  assert.equal(estimate.model, 'claude-haiku-5-5');
  assert.equal((calls.at(-1) as { tool_choice: { name: string } }).tool_choice.name, 'record_estimate');

  // Photo estimate uses the photo model and keeps the photo for its owner only.
  const photo = { mime: 'image/jpeg', data: Buffer.alloc(300, 1).toString('base64') };
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers: asAdmin, payload: { description: '', photo } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().estimate.model, 'claude-sonnet-5-5');
  const photoId = res.json().photoId;
  assert.ok(photoId);
  res = await app.inject({ method: 'GET', url: `/api/photos/${photoId}`, headers: asAdmin });
  assert.equal(res.statusCode, 200);

  // Save an entry with the estimate attached.
  res = await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: asAdmin,
    payload: { slotId: slots[3].id, date: '2026-11-09', description: 'Merenda', ...estimate.totals, items: estimate.items, estimate: 'calculated', photoId }
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().source, 'in_app');
  assert.equal(res.json().items.length, 2);

  // Save now, calculate in the background.
  res = await app.inject({
    method: 'POST',
    url: '/api/entries',
    headers: asAdmin,
    payload: { slotId: slots[0].id, date: '2026-11-09', description: 'yogurt e biscotti', calculate: true }
  });
  const pendingId = res.json().id;
  assert.equal(res.json().calcStatus, 'pending');
  const getUser = (id: number) => db.select().from(users).where(eq(users.id, id)).get();
  assert.equal(await processPendingEntries(ai, getUser), 1);
  res = await app.inject({ method: 'GET', url: `/api/entries/${pendingId}`, headers: asAdmin });
  assert.equal(res.json().calcStatus, 'calculated');
  assert.equal(res.json().kcal, 150);

  // An invalid key is reported clearly.
  respondNext({ status: 401, body: { error: { type: 'authentication_error' } } });
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers: asAdmin, payload: { description: 'pane' } });
  assert.equal(res.json().error, 'aiKeyInvalid');

  // Usage is tracked and the monthly cap stops further calls.
  res = await app.inject({ method: 'GET', url: '/api/ai/status', headers: asAdmin });
  assert.ok(res.json().spentUsd > 0);
  res = await app.inject({ method: 'GET', url: '/api/admin/ai/usage', headers: asAdmin });
  assert.ok(res.json().rows.length >= 2);
  await app.inject({ method: 'PATCH', url: '/api/admin/ai', headers: asAdmin, payload: { monthlyCapUsd: 0 } });
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers: asAdmin, payload: { description: 'mela' } });
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().error, 'aiCapReached');

  // Another user cannot read the photo.
  res = await app.inject({ method: 'POST', url: '/api/admin/invites', headers: asAdmin, payload: {} });
  res = await app.inject({ method: 'POST', url: '/api/register', payload: { token: res.json().token, name: 'Bob', email: 'bob@example.com', password: 'another long password' } });
  res = await app.inject({ method: 'GET', url: `/api/photos/${photoId}`, headers: { cookie: cookieOf(res) } });
  assert.equal(res.statusCode, 404);

  await app.close();
});

test('estimate limits: daily requests and bursts', async () => {
  const { app } = await setupApp();
  let res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  const headers = { cookie: cookieOf(res) };
  await app.inject({ method: 'PATCH', url: '/api/admin/ai', headers, payload: { enabled: true, apiKey: 'sk-ant-limit-test', dailyRequests: 3, perMinute: null } });
  for (let i = 0; i < 3; i++) {
    res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers, payload: { description: `pasto ${i}` } });
    assert.equal(res.statusCode, 200, res.body);
  }
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers, payload: { description: 'troppi' } });
  assert.equal(res.json().error, 'aiDailyLimit');
  res = await app.inject({ method: 'GET', url: '/api/ai/status', headers });
  assert.equal(res.json().limitReached, true);
  assert.equal(res.json().requestsToday, 3);

  // Burst protection.
  await app.inject({ method: 'PATCH', url: '/api/admin/ai', headers, payload: { dailyRequests: null, perMinute: 2 } });
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers, payload: { description: 'a' } });
  assert.equal(res.statusCode, 200);
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers, payload: { description: 'b' } });
  assert.equal(res.statusCode, 200);
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers, payload: { description: 'c' } });
  assert.equal(res.json().error, 'aiTooFast');

  // Instance budget.
  await app.inject({ method: 'PATCH', url: '/api/admin/ai', headers, payload: { perMinute: null, instanceMonthlyUsd: 0 } });
  res = await app.inject({ method: 'POST', url: '/api/ai/estimate', headers, payload: { description: 'd' } });
  assert.equal(res.json().error, 'aiInstanceCap');

  await app.close();
});

test('favorites, suggestions, weights, trends, export and bulk estimates', async () => {
  const { app, db, push, sent, ai } = await setupApp();
  let res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  const headers = { cookie: cookieOf(res) };
  const slots = (await app.inject({ method: 'GET', url: '/api/slots', headers })).json();

  // Favorites: save, use, counted.
  res = await app.inject({
    method: 'POST',
    url: '/api/favorites',
    headers,
    payload: { name: 'Colazione solita', description: 'Yogurt e caffè', kcal: 150, protein: 8, carbs: 12, fat: 6, slotId: slots[0].id }
  });
  assert.equal(res.statusCode, 200, res.body);
  const fav = res.json();
  res = await app.inject({ method: 'POST', url: `/api/favorites/${fav.id}/use`, headers, payload: { slotId: slots[0].id, date: '2026-11-09' } });
  assert.equal(res.json().source, 'favorite');
  assert.equal(res.json().kcal, 150);
  res = await app.inject({ method: 'GET', url: '/api/favorites', headers });
  assert.equal(res.json()[0].uses, 1);

  // Suggestions need a meal logged at least twice.
  await app.inject({ method: 'POST', url: `/api/favorites/${fav.id}/use`, headers, payload: { slotId: slots[0].id, date: '2026-11-08' } });
  res = await app.inject({ method: 'GET', url: `/api/suggestions?slotId=${slots[0].id}`, headers });
  assert.equal(res.json()[0].times, 2);

  // Weights.
  res = await app.inject({ method: 'PUT', url: '/api/weights/2026-10-19', headers, payload: { kg: 73.2 } });
  assert.equal(res.statusCode, 200, res.body);
  await app.inject({ method: 'PUT', url: '/api/weights/2026-11-02', headers, payload: { kg: 72.44 } });
  res = await app.inject({ method: 'GET', url: '/api/weights?from=2026-10-01&to=2026-11-30', headers });
  assert.deepEqual(res.json().map((w: { kg: number }) => w.kg), [73.2, 72.4]);

  // Weigh-in reminder: every 2 weeks on Monday at 07:30; last weigh-in 2026-11-02.
  await app.inject({
    method: 'PATCH',
    url: '/api/me',
    headers,
    payload: { weightReminderEnabled: true, weightReminderWeeks: 2, weightReminderWeekday: 1, weightReminderTime: '07:30' }
  });
  await app.inject({
    method: 'POST',
    url: '/api/push/subscribe',
    headers,
    payload: { endpoint: 'https://push.example.com/w', keys: { p256dh: 'p256dh-key-0123456789', auth: 'auth-key-0123' } }
  });
  for (const s of slots) await app.inject({ method: 'PATCH', url: `/api/slots/${s.id}`, headers, payload: { reminderEnabled: false } });
  // Monday 9 Nov, 07:40 in Rome: only 7 days since the last weigh-in → nothing.
  assert.equal(await runReminderTick(db, push, new Date('2026-11-09T06:40:00Z')), 0);
  // Monday 16 Nov: 14 days → reminder, once.
  assert.equal(await runReminderTick(db, push, new Date('2026-11-16T06:40:00Z')), 1);
  assert.equal(sent.at(-1)?.payload.url, '/trends?tab=weight');
  assert.equal(await runReminderTick(db, push, new Date('2026-11-16T06:50:00Z')), 0);

  // Trends with thresholds.
  await app.inject({ method: 'PUT', url: '/api/thresholds', headers, payload: { items: [{ nutrient: 'kcal', min: null, max: 2000 }] } });
  res = await app.inject({ method: 'GET', url: '/api/trends?from=2026-11-03&to=2026-11-09', headers });
  assert.equal(res.statusCode, 200, res.body);
  const days = res.json().days;
  assert.equal(days.length, 7);
  assert.equal(days.at(-1).kcal, 150);
  assert.equal(days.at(-2).kcal, 150);

  // Export.
  res = await app.inject({ method: 'GET', url: '/api/export.csv?from=2026-11-01&to=2026-11-30', headers });
  assert.match(res.headers['content-disposition'] as string, /attachment/);
  assert.match(res.body, /Yogurt e caffè/);
  res = await app.inject({ method: 'GET', url: '/api/export.json', headers });
  const dump = JSON.parse(res.body);
  assert.equal(dump.weights.length, 2);
  assert.equal(dump.favorites.length, 1);

  // Bulk background estimates for a day.
  await app.inject({ method: 'PATCH', url: '/api/admin/ai', headers, payload: { enabled: true, apiKey: 'sk-ant-bulk-test', perMinute: null } });
  await app.inject({ method: 'POST', url: '/api/entries', headers, payload: { slotId: slots[2].id, date: '2026-11-07', description: 'pasta' } });
  await app.inject({ method: 'POST', url: '/api/entries', headers, payload: { slotId: slots[4].id, date: '2026-11-07', description: 'pizza' } });
  res = await app.inject({ method: 'POST', url: '/api/day/2026-11-07/calculate', headers });
  assert.equal(res.json().queued, 2);
  const getUser = (id: number) => db.select().from(users).where(eq(users.id, id)).get();
  assert.equal(await processPendingEntries(ai, getUser), 2);

  await app.close();
});

test('shared food library: barcode lookup, label reading, logging by grams and servings, permissions', async () => {
  const { app, respondNext } = await setupApp();
  let res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  const asAdmin = { cookie: cookieOf(res) };
  const slots = (await app.inject({ method: 'GET', url: '/api/slots', headers: asAdmin })).json();

  // Unknown in the library: Open Food Facts proposes a draft.
  res = await app.inject({ method: 'GET', url: '/api/products/barcode/8013355998702', headers: asAdmin });
  assert.equal(res.json().product, null);
  const draft = res.json().draft;
  assert.equal(draft.brand, 'Gran Pavesi');

  res = await app.inject({ method: 'POST', url: '/api/products', headers: asAdmin, payload: draft });
  assert.equal(res.statusCode, 200, res.body);
  const product = res.json();
  res = await app.inject({ method: 'POST', url: '/api/products', headers: asAdmin, payload: draft });
  assert.equal(res.statusCode, 409);

  // Now it is found locally.
  res = await app.inject({ method: 'GET', url: '/api/products/barcode/8013355998702', headers: asAdmin });
  assert.equal(res.json().product.id, product.id);

  // Log one serving (32 g) and 50 g.
  res = await app.inject({ method: 'POST', url: `/api/products/${product.id}/log`, headers: asAdmin, payload: { slotId: slots[1].id, date: '2026-11-09', servings: 1 } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().kcal, 151.7);
  assert.equal(res.json().source, 'library');
  res = await app.inject({ method: 'POST', url: `/api/products/${product.id}/log`, headers: asAdmin, payload: { slotId: slots[1].id, date: '2026-11-09', grams: 50 } });
  assert.equal(res.json().kcal, 237);

  // Search by name and brand.
  res = await app.inject({ method: 'GET', url: '/api/products?q=pavesi', headers: asAdmin });
  assert.equal(res.json().length, 1);

  // Label photo read by AI.
  await app.inject({ method: 'PATCH', url: '/api/admin/ai', headers: asAdmin, payload: { enabled: true, apiKey: 'sk-ant-label', perMinute: null } });
  respondNext({
    status: 200,
    body: {
      content: [{ type: 'tool_use', name: 'record_label', input: { name: 'Crackers', kcal_100g: 430, protein_100g: 10, carbs_100g: 70, fat_100g: 11, fiber_100g: -1, serving_g: 25, readable: true } }],
      usage: { input_tokens: 1500, output_tokens: 100 }
    }
  });
  const photo = { mime: 'image/jpeg', data: Buffer.alloc(300, 2).toString('base64') };
  res = await app.inject({ method: 'POST', url: '/api/products/label', headers: asAdmin, payload: { photo } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().kcal, 430);
  assert.equal(res.json().fiber, null);
  assert.equal(res.json().servingG, 25);

  // Shared: another user sees it but cannot edit it.
  res = await app.inject({ method: 'POST', url: '/api/admin/invites', headers: asAdmin, payload: {} });
  res = await app.inject({ method: 'POST', url: '/api/register', payload: { token: res.json().token, name: 'Bob', email: 'bob@example.com', password: 'another long password' } });
  const bob = { cookie: cookieOf(res) };
  res = await app.inject({ method: 'GET', url: '/api/products?q=taral', headers: bob });
  assert.equal(res.json()[0].canEdit, false);
  res = await app.inject({ method: 'DELETE', url: `/api/products/${product.id}`, headers: bob });
  assert.equal(res.statusCode, 403);

  // Open Food Facts can be switched off by the admin.
  await app.inject({ method: 'PATCH', url: '/api/admin/settings', headers: asAdmin, payload: { offEnabled: false } });
  res = await app.inject({ method: 'GET', url: '/api/products/barcode/8013355998702', headers: bob });
  assert.ok(res.json().product);
  res = await app.inject({ method: 'GET', url: '/api/products/barcode/12345678', headers: bob });
  assert.equal(res.json().draft, null);

  await app.close();
});

test('security headers: CSP with inline script hashes, permissions policy, HSTS behind HTTPS', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mealler-web-'));
  const boot = 'console.log("boot")';
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html><head><script>${boot}</script><script type="module" src="/x.js"></script></head><body></body></html>`);
  const { app } = await setupApp(dir);
  const hash = createHash('sha256').update(boot).digest('base64');

  let res = await app.inject({ method: 'GET', url: '/' });
  assert.equal(res.statusCode, 200);
  const csp = String(res.headers['content-security-policy']);
  assert.ok(csp.includes(`script-src 'self' 'sha256-${hash}'`), csp);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(String(res.headers['permissions-policy']), /camera=\(self\)/);
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['strict-transport-security'], undefined);

  // SPA fallback is HTML too.
  res = await app.inject({ method: 'GET', url: '/profile/thresholds' });
  assert.ok(res.headers['content-security-policy']);

  // JSON does not carry the CSP; HSTS only when the proxy says HTTPS.
  res = await app.inject({ method: 'GET', url: '/api/status', headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(res.headers['content-security-policy'], undefined);
  assert.match(String(res.headers['strict-transport-security']), /max-age=/);
});

test('account deletion: password, last admin, cascade and photos', async () => {
  const { app, db, ai } = await setupApp();
  let res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  const adminCookie = cookieOf(res);
  res = await app.inject({ method: 'PATCH', url: '/api/admin/settings', headers: { cookie: adminCookie }, payload: { registrationOpen: true } });
  assert.equal(res.statusCode, 200, res.body);
  const bob = { name: 'Bob', email: 'bob@example.com', password: 'another long password', locale: 'it', timezone: 'Europe/Rome' };
  res = await app.inject({ method: 'POST', url: '/api/register', payload: bob });
  assert.equal(res.statusCode, 200, res.body);
  const bobCookie = cookieOf(res);
  const bobId = res.json().id as number;

  res = await app.inject({ method: 'GET', url: '/api/slots', headers: { cookie: bobCookie } });
  const slotId = res.json()[0].id;
  res = await app.inject({ method: 'POST', url: '/api/entries', headers: { cookie: bobCookie }, payload: { date: '2026-11-09', slotId, description: 'Mela' } });
  assert.equal(res.statusCode, 200, res.body);
  const photoDir = join(ai.dataDir, 'photos', String(bobId));
  mkdirSync(photoDir, { recursive: true });
  writeFileSync(join(photoDir, 'x.jpg'), 'x');

  // The only admin cannot delete themselves while other users exist.
  res = await app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie: adminCookie }, payload: { password: admin.password } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'lastAdmin');

  // Wrong password.
  res = await app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie: bobCookie }, payload: { password: 'wrong' } });
  assert.equal(res.statusCode, 400);

  res = await app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie: bobCookie }, payload: { password: bob.password } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(db.select().from(users).where(eq(users.id, bobId)).get(), undefined);
  assert.equal(existsSync(photoDir), false);
  res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: bobCookie } });
  assert.equal(res.statusCode, 401);
  res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: bob.email, password: bob.password } });
  assert.equal(res.statusCode, 401);

  // Now the admin is alone and may delete the instance owner account.
  res = await app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie: adminCookie }, payload: { password: admin.password } });
  assert.equal(res.statusCode, 200);
  res = await app.inject({ method: 'GET', url: '/api/status' });
  assert.equal(res.json().setupRequired, true);
});

test('food category: chosen per entry, favorite and product, carried over, reset to automatic', async () => {
  const { app } = await setupApp();
  let res = await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
  const headers = { cookie: cookieOf(res) };
  const slots = (await app.inject({ method: 'GET', url: '/api/slots', headers })).json();

  // Entries: automatic by default, chosen on create, changed and reset on update, validated.
  res = await app.inject({ method: 'POST', url: '/api/entries', headers, payload: { slotId: slots[0].id, date: '2026-11-09', description: 'Yogurt greco' } });
  assert.equal(res.json().category, null);
  res = await app.inject({ method: 'POST', url: '/api/entries', headers, payload: { slotId: slots[0].id, date: '2026-11-09', description: 'Bowl', category: 'fruit' } });
  assert.equal(res.statusCode, 200, res.body);
  const entry = res.json();
  assert.equal(entry.category, 'fruit');
  res = await app.inject({ method: 'PATCH', url: `/api/entries/${entry.id}`, headers, payload: { category: 'sweets' } });
  assert.equal(res.json().category, 'sweets');
  res = await app.inject({ method: 'PATCH', url: `/api/entries/${entry.id}`, headers, payload: { kcal: 300 } });
  assert.equal(res.json().category, 'sweets');
  res = await app.inject({ method: 'PATCH', url: `/api/entries/${entry.id}`, headers, payload: { category: null } });
  assert.equal(res.json().category, null);
  res = await app.inject({ method: 'PATCH', url: `/api/entries/${entry.id}`, headers, payload: { category: 'cake' } });
  assert.equal(res.statusCode, 400);

  // Favorites keep the category and pass it to the entries they create; it can be changed later.
  res = await app.inject({ method: 'POST', url: '/api/favorites', headers, payload: { name: 'Pranzo', description: 'Bowl del giovedì', kcal: 500, category: 'pasta' } });
  const fav = res.json();
  assert.equal(fav.category, 'pasta');
  res = await app.inject({ method: 'POST', url: `/api/favorites/${fav.id}/use`, headers, payload: { slotId: slots[2].id, date: '2026-11-09' } });
  assert.equal(res.json().category, 'pasta');
  res = await app.inject({ method: 'PATCH', url: `/api/favorites/${fav.id}`, headers, payload: { category: 'legumes' } });
  assert.equal(res.json().category, 'legumes');
  assert.equal(res.json().name, 'Pranzo');
  res = await app.inject({ method: 'PATCH', url: `/api/favorites/${fav.id}`, headers, payload: {} });
  assert.equal(res.statusCode, 400);

  // Products: chosen in the library, copied to the entries logged from them.
  res = await app.inject({ method: 'POST', url: '/api/products', headers, payload: { name: 'Barretta', kcal: 400, protein: 20, carbs: 40, fat: 15, category: 'sweets' } });
  const product = res.json();
  assert.equal(product.category, 'sweets');
  res = await app.inject({ method: 'POST', url: `/api/products/${product.id}/log`, headers, payload: { slotId: slots[1].id, date: '2026-11-09', grams: 30 } });
  assert.equal(res.json().category, 'sweets');
  res = await app.inject({ method: 'PATCH', url: `/api/products/${product.id}`, headers, payload: { category: null } });
  assert.equal(res.json().category, null);

  // The CSV export has the category in use: chosen, or guessed from the description.
  res = await app.inject({ method: 'GET', url: '/api/export.csv?from=2026-11-09&to=2026-11-09', headers });
  const lines = res.body.trim().split('\r\n');
  assert.ok(lines[0].endsWith(',category'));
  assert.ok(lines.some((l) => l.includes('Yogurt greco') && l.endsWith(',dairy')));
  assert.ok(lines.some((l) => l.includes('Bowl del giovedì') && l.endsWith(',pasta')));
});

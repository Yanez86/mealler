// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Status } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  hashPassword,
  randomToken,
  requireUser,
  sha256,
  verifyPassword
} from '../auth.ts';
import { invites, oauthTokens, sessions, users } from '../db/schema.ts';
import { latestVersion } from '../updates.ts';
import { HttpError, conflict, forbidden } from '../http.ts';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  countActiveAdmins,
  countUsers,
  createUserWithDefaults,
  findUserByEmail,
  isRegistrationOpen,
  toUser
} from '../services.ts';
import { zDate, zEmail, zLocale, zName, zPassword, zTheme, zTime, zTimezone, zUnits } from '../validation.ts';

const strict = { rateLimit: { max: 10, timeWindow: '5 minutes' } };

/**
 * Failed logins per account, whatever address they come from: after 5 in a row the account waits
 * 30 seconds, then twice as long after each further failure, up to 15 minutes.
 * ponytail: in memory (a restart forgives everyone), and an outsider can keep an account waiting by
 * failing on purpose; move to the database with a per-device exception if that ever happens.
 */
function loginGuard(now = Date.now) {
  const FREE = 5;
  const MAX_WAIT = 15 * 60_000;
  const failures = new Map<string, { count: number; until: number; at: number }>();
  return {
    locked: (email: string) => (failures.get(email)?.until ?? 0) > now(),
    clear: (email: string) => void failures.delete(email),
    fail(email: string) {
      const f = failures.get(email) ?? { count: 0, until: 0, at: 0 };
      f.count++;
      f.at = now();
      if (f.count >= FREE) f.until = f.at + Math.min(2 ** (f.count - FREE) * 30_000, MAX_WAIT);
      failures.set(email, f);
      // Made-up addresses must not grow the map forever.
      if (failures.size > 10_000) for (const [key, v] of failures) if (now() - v.at > MAX_WAIT) failures.delete(key);
      if (failures.size > 20_000) failures.clear();
    }
  };
}

export async function authRoutes(app: FastifyInstance, { db, config, ai }: AppContext) {
  const guard = loginGuard();
  // Checked for addresses with no account, so "unknown" and "wrong password" take the same time.
  let noAccountHash: Promise<string> | undefined;

  app.get('/status', async (): Promise<Status> => ({
    setupRequired: countUsers(db) === 0,
    registrationOpen: isRegistrationOpen(db),
    version: config.version,
    latestVersion: latestVersion(config.updateCheck),
    sourceUrl: config.sourceUrl
  }));

  const accountBody = z.object({
    name: zName,
    email: zEmail,
    password: zPassword,
    locale: zLocale.default('it'),
    timezone: zTimezone.default('Europe/Rome')
  });

  app.post('/setup', { config: strict }, async (request, reply) => {
    const body = accountBody.parse(request.body);
    // Before hashing, so a configured instance spends no CPU here; and again after, since hashing takes time.
    if (countUsers(db) > 0) throw forbidden('setupDone');
    const passwordHash = await hashPassword(body.password);
    if (countUsers(db) > 0) throw forbidden('setupDone');
    const user = createUserWithDefaults(db, { ...body, passwordHash, role: 'admin' });
    createSession(db, request, reply, user.id);
    return toUser(user);
  });

  app.post('/auth/login', { config: strict }, async (request, reply) => {
    const body = z.object({ email: zEmail, password: z.string().max(200) }).parse(request.body);
    if (guard.locked(body.email)) throw new HttpError(429, 'tooMany');
    const user = findUserByEmail(db, body.email);
    const ok = await verifyPassword(user?.passwordHash ?? (await (noAccountHash ??= hashPassword(randomToken()))), body.password);
    if (!user || !ok || !user.active) {
      guard.fail(body.email);
      throw new HttpError(401, 'invalidCredentials');
    }
    guard.clear(body.email);
    createSession(db, request, reply, user.id);
    return toUser(user);
  });

  app.post('/auth/logout', async (request, reply) => {
    destroySession(db, request, reply);
    return { ok: true };
  });

  app.get('/invites/:token', async (request) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(request.params);
    const invite = db
      .select()
      .from(invites)
      .where(and(eq(invites.token, token), isNull(invites.usedAt), gt(invites.expiresAt, Date.now())))
      .get();
    return { valid: !!invite, email: invite?.email ?? null };
  });

  app.post('/register', { config: strict }, async (request, reply) => {
    const body = accountBody.extend({ token: z.string().max(100).optional() }).parse(request.body);
    let inviteToken: string | null = null;
    if (body.token) {
      const invite = db
        .select()
        .from(invites)
        .where(and(eq(invites.token, body.token), isNull(invites.usedAt), gt(invites.expiresAt, Date.now())))
        .get();
      if (!invite) throw forbidden('invalidInvite');
      if (invite.email && invite.email.toLowerCase() !== body.email) throw forbidden('inviteEmailMismatch');
      inviteToken = invite.token;
    } else if (!isRegistrationOpen(db)) {
      throw forbidden('registrationClosed');
    }
    if (countUsers(db) === 0) throw forbidden('setupRequired');
    if (findUserByEmail(db, body.email)) throw conflict('emailTaken');
    const passwordHash = await hashPassword(body.password);
    const user = createUserWithDefaults(db, { ...body, passwordHash, role: 'user' });
    if (inviteToken) {
      db.update(invites).set({ usedAt: new Date().toISOString() }).where(eq(invites.token, inviteToken)).run();
    }
    createSession(db, request, reply, user.id);
    return toUser(user);
  });

  app.get('/me', async (request) => toUser(requireUser(request)));

  app.patch('/me', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({
        name: zName,
        locale: zLocale,
        timezone: zTimezone,
        theme: zTheme,
        units: zUnits,
        remindersEnabled: z.boolean(),
        quietStart: zTime.nullable(),
        quietEnd: zTime.nullable(),
        remindersPausedUntil: zDate.nullable(),
        lastSeenVersion: z.string().max(20),
        weightReminderEnabled: z.boolean(),
        weightReminderWeeks: z.number().int().min(1).max(12),
        weightReminderWeekday: z.number().int().min(1).max(7),
        weightReminderTime: zTime
      })
      .partial()
      .parse(request.body);
    const updated = db.update(users).set(body).where(eq(users.id, user.id)).returning().get();
    return toUser(updated);
  });

  // GDPR: users can delete their own account and every piece of their data.
  app.delete('/me', { config: strict }, async (request, reply) => {
    const user = requireUser(request);
    const { password } = z.object({ password: z.string().max(200) }).parse(request.body ?? {});
    if (!(await verifyPassword(user.passwordHash, password))) throw new HttpError(400, 'wrongPassword');
    if (user.role === 'admin' && countActiveAdmins(db) <= 1 && countUsers(db) > 1) throw new HttpError(400, 'lastAdmin');
    rmSync(join(ai.dataDir, 'photos', String(user.id)), { recursive: true, force: true });
    db.delete(users).where(eq(users.id, user.id)).run();
    destroySession(db, request, reply);
    return { ok: true };
  });

  app.post('/me/password', { config: strict }, async (request) => {
    const user = requireUser(request);
    const body = z.object({ current: z.string().max(200), next: zPassword }).parse(request.body);
    if (!(await verifyPassword(user.passwordHash, body.current))) throw new HttpError(400, 'wrongPassword');
    const passwordHash = await hashPassword(body.next);
    db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
    // Sign out every other device, and every app connected through the connector: whoever knew the old
    // password, or held a token obtained with it, is out.
    const current = request.cookies[SESSION_COOKIE];
    const keep = current ? sha256(current) : '';
    db.delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, keep)))
      .run();
    db.delete(oauthTokens).where(eq(oauthTokens.userId, user.id)).run();
    return { ok: true };
  });
}

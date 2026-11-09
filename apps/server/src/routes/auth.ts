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
  requireUser,
  sha256,
  verifyPassword
} from '../auth.ts';
import { invites, sessions, users } from '../db/schema.ts';
import { latestVersion } from '../updates.ts';
import { HttpError, conflict, forbidden } from '../http.ts';
import {
  countUsers,
  createUserWithDefaults,
  findUserByEmail,
  isRegistrationOpen,
  toUser
} from '../services.ts';
import { zDate, zEmail, zLocale, zName, zPassword, zTheme, zTime, zTimezone } from '../validation.ts';

const strict = { rateLimit: { max: 10, timeWindow: '5 minutes' } };

export async function authRoutes(app: FastifyInstance, { db, config }: AppContext) {
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
    const passwordHash = await hashPassword(body.password);
    // Re-check inside the request: setup only works on an empty instance.
    if (countUsers(db) > 0) throw forbidden('setupDone');
    const user = createUserWithDefaults(db, { ...body, passwordHash, role: 'admin' });
    createSession(db, request, reply, user.id);
    return toUser(user);
  });

  app.post('/auth/login', { config: strict }, async (request, reply) => {
    const body = z.object({ email: zEmail, password: z.string().max(200) }).parse(request.body);
    const user = findUserByEmail(db, body.email);
    const ok = user ? await verifyPassword(user.passwordHash, body.password) : false;
    if (!user || !ok || !user.active) throw new HttpError(401, 'invalidCredentials');
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
        remindersEnabled: z.boolean(),
        quietStart: zTime.nullable(),
        quietEnd: zTime.nullable(),
        remindersPausedUntil: zDate.nullable()
      })
      .partial()
      .parse(request.body);
    const updated = db.update(users).set(body).where(eq(users.id, user.id)).returning().get();
    return toUser(updated);
  });

  app.post('/me/password', { config: strict }, async (request) => {
    const user = requireUser(request);
    const body = z.object({ current: z.string().max(200), next: zPassword }).parse(request.body);
    if (!(await verifyPassword(user.passwordHash, body.current))) throw new HttpError(400, 'wrongPassword');
    const passwordHash = await hashPassword(body.next);
    db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
    // Sign out every other device.
    const current = request.cookies[SESSION_COOKIE];
    const keep = current ? sha256(current) : '';
    db.delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, keep)))
      .run();
    return { ok: true };
  });
}

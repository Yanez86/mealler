// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Invite } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { hashPassword, randomToken, requireAdmin } from '../auth.ts';
import { invites, sessions, users } from '../db/schema.ts';
import { badRequest, conflict, notFound } from '../http.ts';
import {
  countActiveAdmins,
  createUserWithDefaults,
  findUserByEmail,
  isRegistrationOpen,
  setSetting,
  toUser
} from '../services.ts';
import { zEmail, zId, zLocale, zName, zPassword, zTimezone } from '../validation.ts';
import { isMcpEnabled } from '../oauth.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function adminRoutes(app: FastifyInstance, { db, config }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireAdmin(request);
  });

  const origin = (request: FastifyRequest) => config.baseUrl ?? `${request.protocol}://${request.host}`;

  app.get('/users', async () =>
    db.select().from(users).orderBy(asc(users.name)).all().map(toUser)
  );

  app.post('/users', async (request) => {
    const body = z
      .object({
        name: zName,
        email: zEmail,
        password: zPassword,
        role: z.enum(['admin', 'user']).default('user'),
        locale: zLocale.default('it'),
        timezone: zTimezone.default('Europe/Rome')
      })
      .parse(request.body);
    if (findUserByEmail(db, body.email)) throw conflict('emailTaken');
    const passwordHash = await hashPassword(body.password);
    return toUser(createUserWithDefaults(db, { ...body, passwordHash }));
  });

  app.patch('/users/:id', async (request) => {
    const me = requireAdmin(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const body = z
      .object({ active: z.boolean(), role: z.enum(['admin', 'user']) })
      .partial()
      .parse(request.body);
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target) throw notFound();
    const losesAdmin =
      target.role === 'admin' && target.active && (body.active === false || body.role === 'user');
    if (losesAdmin && countActiveAdmins(db) <= 1) throw badRequest('lastAdmin');
    if (target.id === me.id && body.active === false) throw badRequest('lastAdmin');
    const updated = db.update(users).set(body).where(eq(users.id, id)).returning().get();
    if (body.active === false) db.delete(sessions).where(eq(sessions.userId, id)).run();
    return toUser(updated);
  });

  app.get('/invites', async (request): Promise<Invite[]> =>
    db
      .select()
      .from(invites)
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, Date.now())))
      .orderBy(desc(invites.createdAt))
      .all()
      .map((row) => ({
        token: row.token,
        email: row.email,
        expiresAt: new Date(row.expiresAt).toISOString(),
        usedAt: row.usedAt,
        url: `${origin(request)}/register?token=${row.token}`
      }))
  );

  app.post('/invites', async (request): Promise<Invite> => {
    const admin = requireAdmin(request);
    const body = z
      .object({
        email: z.union([zEmail, z.literal('')]).nullable().optional(),
        days: z.number().int().min(1).max(60).default(7)
      })
      .parse(request.body ?? {});
    const token = randomToken(24);
    const expiresAt = Date.now() + body.days * DAY_MS;
    const email = body.email ? body.email : null;
    db.insert(invites).values({ token, email, expiresAt, createdBy: admin.id }).run();
    return {
      token,
      email,
      expiresAt: new Date(expiresAt).toISOString(),
      usedAt: null,
      url: `${origin(request)}/register?token=${token}`
    };
  });

  app.delete('/invites/:token', async (request) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(request.params);
    db.delete(invites).where(eq(invites.token, token)).run();
    return { ok: true };
  });

  const currentSettings = () => ({ registrationOpen: isRegistrationOpen(db), mcpEnabled: isMcpEnabled(db) });

  app.get('/settings', async () => currentSettings());

  app.patch('/settings', async (request) => {
    const body = z.object({ registrationOpen: z.boolean(), mcpEnabled: z.boolean() }).partial().parse(request.body);
    if (body.registrationOpen !== undefined) setSetting(db, 'registration_open', String(body.registrationOpen));
    if (body.mcpEnabled !== undefined) setSetting(db, 'mcp_enabled', String(body.mcpEnabled));
    return currentSettings();
  });
}

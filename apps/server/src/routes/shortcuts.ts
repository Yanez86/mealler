// SPDX-License-Identifier: AGPL-3.0-or-later
// iPhone shortcuts: a personal key lets a shortcut add a glass of water for its user, and nothing else.
// The key is shown once, when made; only its hash is kept. The answer is plain text, ready for a
// notification: "Water: 1.25 l of 2 l".
import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { formatWater, isLocale, todayIn, translate, type ShortcutKey } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { randomToken, requireUser, sha256 } from '../auth.ts';
import { shortcutKeys, users } from '../db/schema.ts';
import { notFound } from '../http.ts';
import { MAX_DRINK_ML, addWater } from './water.ts';

const toKey = (row: typeof shortcutKeys.$inferSelect): ShortcutKey => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt
});

/** Keys start with "mlr_" so they are easy to recognise (and to find if pasted somewhere by mistake). */
export const newShortcutToken = () => `mlr_${randomToken(24)}`;

export async function shortcutRoutes(app: FastifyInstance, { db }: AppContext) {
  app.get('/shortcut-keys', async (request) => {
    const user = requireUser(request);
    return db.select().from(shortcutKeys).where(eq(shortcutKeys.userId, user.id)).orderBy(desc(shortcutKeys.id)).all().map(toKey);
  });

  app.post('/shortcut-keys', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const user = requireUser(request);
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(request.body);
    const token = newShortcutToken();
    const row = db.insert(shortcutKeys).values({ userId: user.id, name, tokenHash: sha256(token) }).returning().get();
    return { ...toKey(row), token };
  });

  app.delete('/shortcut-keys/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const gone = db
      .delete(shortcutKeys)
      .where(and(eq(shortcutKeys.id, id), eq(shortcutKeys.userId, user.id)))
      .returning({ id: shortcutKeys.id })
      .get();
    if (!gone) throw notFound();
    return { ok: true };
  });

  // The shortcut's own route: Shortcuts may send a POST with no body (or an empty JSON one), and the
  // answer, errors included, is plain text a notification can show as it is.
  await app.register(async (scope) => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
      const text = String(body ?? '').trim();
      if (!text) return done(null, {});
      try {
        done(null, JSON.parse(text));
      } catch {
        done(null, {});
      }
    });

    /** Called with "Authorization: Bearer mlr_…": one glass of the user's size (or `ml`) for today. */
    scope.post('/shortcut/water', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
      reply.header('Content-Type', 'text/plain; charset=utf-8');
      const header = request.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      const found = token
        ? db
            .select({ user: users, keyId: shortcutKeys.id })
            .from(shortcutKeys)
            .innerJoin(users, eq(users.id, shortcutKeys.userId))
            .where(eq(shortcutKeys.tokenHash, sha256(token)))
            .get()
        : undefined;
      if (!found || !found.user.active) {
        reply.code(401);
        return `${translate('it', 'shortcut.badKey')}\n${translate('en', 'shortcut.badKey')}`;
      }
      const { user } = found;
      const locale = isLocale(user.locale) ? user.locale : 'it';
      const asked = request.body && typeof request.body === 'object' ? (request.body as { ml?: unknown }).ml : undefined;
      const ml = asked === undefined || asked === '' ? user.waterGlassMl : Number(asked);
      if (!Number.isInteger(ml) || ml < 1 || ml > MAX_DRINK_ML) {
        reply.code(400);
        return translate(locale, 'shortcut.badAmount');
      }
      db.update(shortcutKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(shortcutKeys.id, found.keyId)).run();
      const day = addWater(db, user.id, todayIn(user.timezone), ml);
      const units = user.units === 'us' ? 'us' : 'metric';
      return translate(locale, 'shortcut.waterDone', {
        amount: formatWater(day.ml, units, locale),
        goal: formatWater(user.waterGoalMl, units, locale)
      });
    });
  });
}

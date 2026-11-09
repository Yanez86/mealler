// SPDX-License-Identifier: AGPL-3.0-or-later
// Favorites (saved meals, reused with one tap) and suggestions (frequent meals from the diary).
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { NUTRIENTS, addDays, todayIn, type Favorite, type Suggestion } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import { entries, favorites, slots } from '../db/schema.ts';
import { badRequest, notFound } from '../http.ts';
import { parseItems, toEntry } from '../services.ts';
import { zAmount, zDate, zEstimateItem, zId, zOptionalText } from '../validation.ts';

function toFavorite(row: typeof favorites.$inferSelect): Favorite {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    kcal: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    slotId: row.slotId,
    uses: row.uses,
    items: parseItems(row.detail)
  };
}

export async function favoriteRoutes(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireUser(request);
  });

  app.get('/favorites', async (request) => {
    const user = requireUser(request);
    return db
      .select()
      .from(favorites)
      .where(eq(favorites.userId, user.id))
      .orderBy(desc(favorites.uses), desc(favorites.id))
      .all()
      .map(toFavorite);
  });

  const body = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(1000),
    quantity: zOptionalText(200),
    kcal: zAmount.default(null),
    protein: zAmount.default(null),
    carbs: zAmount.default(null),
    fat: zAmount.default(null),
    fiber: zAmount.default(null),
    items: z.array(zEstimateItem).max(50).nullable().optional(),
    slotId: zId.nullable().optional()
  });

  app.post('/favorites', async (request) => {
    const user = requireUser(request);
    const b = body.parse(request.body);
    if (b.slotId) {
      const own = db.select().from(slots).where(and(eq(slots.id, b.slotId), eq(slots.userId, user.id))).get();
      if (!own) throw badRequest('slot');
    }
    const row = db
      .insert(favorites)
      .values({
        userId: user.id,
        name: b.name ?? b.description.slice(0, 100),
        description: b.description,
        quantity: b.quantity,
        kcal: b.kcal,
        protein: b.protein,
        carbs: b.carbs,
        fat: b.fat,
        fiber: b.fiber,
        detail: b.items ? JSON.stringify(b.items) : null,
        slotId: b.slotId ?? null
      })
      .returning()
      .get();
    return toFavorite(row);
  });

  app.patch('/favorites/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body);
    const row = db
      .update(favorites)
      .set({ name })
      .where(and(eq(favorites.id, id), eq(favorites.userId, user.id)))
      .returning()
      .get();
    if (!row) throw notFound();
    return toFavorite(row);
  });

  app.delete('/favorites/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    db.delete(favorites).where(and(eq(favorites.id, id), eq(favorites.userId, user.id))).run();
    return { ok: true };
  });

  /** Logs a favorite into a slot in one call. */
  app.post('/favorites/:id/use', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const b = z.object({ slotId: zId, date: zDate }).parse(request.body);
    const fav = db.select().from(favorites).where(and(eq(favorites.id, id), eq(favorites.userId, user.id))).get();
    if (!fav) throw notFound();
    const slot = db.select().from(slots).where(and(eq(slots.id, b.slotId), eq(slots.userId, user.id))).get();
    if (!slot) throw badRequest('slot');
    const values = Object.fromEntries(NUTRIENTS.map((n) => [n, fav[n]]));
    const row = db
      .insert(entries)
      .values({
        userId: user.id,
        slotId: slot.id,
        date: b.date,
        description: fav.description,
        quantity: fav.quantity,
        ...values,
        detail: fav.detail,
        source: 'favorite',
        calcStatus: 'manual'
      })
      .returning()
      .get();
    db.update(favorites).set({ uses: sql`${favorites.uses} + 1` }).where(eq(favorites.id, fav.id)).run();
    return toEntry(row);
  });

  /** Most frequent meals of the last 60 days, optionally for one slot, with their latest values. */
  app.get('/suggestions', async (request): Promise<Suggestion[]> => {
    const user = requireUser(request);
    const { slotId } = z.object({ slotId: zId.optional() }).parse(request.query);
    const since = addDays(todayIn(user.timezone), -60);
    const where = slotId
      ? and(eq(entries.userId, user.id), gte(entries.date, since), eq(entries.slotId, slotId))
      : and(eq(entries.userId, user.id), gte(entries.date, since));
    const rows = db.select().from(entries).where(where).orderBy(desc(entries.date), desc(entries.id)).all();
    const groups = new Map<string, { latest: (typeof rows)[number]; times: number }>();
    for (const row of rows) {
      const key = row.description.trim().toLowerCase();
      const g = groups.get(key);
      if (g) g.times++;
      else groups.set(key, { latest: row, times: 1 });
    }
    return [...groups.values()]
      .filter((g) => g.times >= 2 && g.latest.kcal != null)
      .sort((a, b) => b.times - a.times)
      .slice(0, 6)
      .map(({ latest, times }) => ({
        description: latest.description,
        quantity: latest.quantity,
        kcal: latest.kcal,
        protein: latest.protein,
        carbs: latest.carbs,
        fat: latest.fat,
        fiber: latest.fiber,
        items: parseItems(latest.detail),
        times
      }));
  });
}

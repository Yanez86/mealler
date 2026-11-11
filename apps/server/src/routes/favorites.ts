// SPDX-License-Identifier: AGPL-3.0-or-later
// Favorites (saved meals, reused with one tap) and suggestions (frequent meals from the diary).
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { NUTRIENTS, addDays, todayIn, type Favorite, type FavoriteFood, type NutrientValues, type Suggestion } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import { entries, favorites, slots } from '../db/schema.ts';
import { badRequest, notFound } from '../http.ts';
import { parseItems, toEntry } from '../services.ts';
import { zAmount, zDate, zEstimateItem, zFoodCategory, zId, zOptionalText } from '../validation.ts';

type FavoriteRow = typeof favorites.$inferSelect;

function parseFoods(json: string | null): FavoriteFood[] | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) && value.length ? (value as FavoriteFood[]) : null;
  } catch {
    return null;
  }
}

/** The foods of a favorite: its list, or the single food kept in its columns (favorites saved before 1.6). */
export function favoriteFoods(row: FavoriteRow): FavoriteFood[] {
  return (
    parseFoods(row.foods) ?? [
      {
        description: row.description,
        quantity: row.quantity,
        kcal: row.kcal,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        fiber: row.fiber,
        items: parseItems(row.detail),
        category: row.category
      }
    ]
  );
}

/** Per nutrient, the sum over the foods that have it (null when none has). */
function totalOf(foods: FavoriteFood[]): NutrientValues {
  return Object.fromEntries(
    NUTRIENTS.map((n) => {
      const known = foods.map((f) => f[n]).filter((v): v is number => v != null);
      return [n, known.length ? Math.round(known.reduce((s, v) => s + v, 0) * 10) / 10 : null];
    })
  ) as NutrientValues;
}

function toFavorite(row: FavoriteRow): Favorite {
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
    items: parseItems(row.detail),
    category: row.category,
    foods: favoriteFoods(row)
  };
}

/** Columns of a favorite made of several foods: the list, plus a summary for lists and search. */
function mealColumns(foods: FavoriteFood[]) {
  const single = foods.length === 1 ? foods[0] : null;
  return {
    description: foods.map((f) => f.description).join(', ').slice(0, 1000),
    quantity: single?.quantity ?? null,
    ...totalOf(foods),
    detail: single?.items ? JSON.stringify(single.items) : null,
    category: single?.category ?? null,
    foods: JSON.stringify(foods)
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
    slotId: zId.nullable().optional(),
    category: zFoodCategory.optional()
  });

  const zFood = z.object({
    description: z.string().trim().min(1).max(1000),
    quantity: zOptionalText(200),
    kcal: zAmount.default(null),
    protein: zAmount.default(null),
    carbs: zAmount.default(null),
    fat: zAmount.default(null),
    fiber: zAmount.default(null),
    items: z.array(zEstimateItem).max(50).nullable().optional(),
    category: zFoodCategory.nullable().optional()
  });
  /** A meal of one or more foods, as made in the favorite editor. */
  const mealBody = z.object({
    name: z.string().trim().min(1).max(100),
    slotId: zId.nullable().optional(),
    foods: z.array(zFood).min(1).max(30)
  });
  const cleanFoods = (foods: z.infer<typeof zFood>[]): FavoriteFood[] =>
    foods.map((f) => ({ ...f, quantity: f.quantity ?? null, items: f.items ?? null, category: f.category ?? null }));

  const checkSlot = (userId: number, slotId: number | null | undefined) => {
    if (slotId && !db.select().from(slots).where(and(eq(slots.id, slotId), eq(slots.userId, userId))).get()) throw badRequest('slot');
  };

  app.post('/favorites', async (request) => {
    const user = requireUser(request);
    if (request.body && typeof request.body === 'object' && 'foods' in request.body) {
      const m = mealBody.parse(request.body);
      checkSlot(user.id, m.slotId);
      const row = db
        .insert(favorites)
        .values({ userId: user.id, name: m.name, slotId: m.slotId ?? null, ...mealColumns(cleanFoods(m.foods)) })
        .returning()
        .get();
      return toFavorite(row);
    }
    const b = body.parse(request.body);
    checkSlot(user.id, b.slotId);
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
        slotId: b.slotId ?? null,
        category: b.category ?? null
      })
      .returning()
      .get();
    return toFavorite(row);
  });

  app.patch('/favorites/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const b = z
      .object({ name: z.string().trim().min(1).max(100).optional(), category: zFoodCategory.optional() })
      .refine((v) => v.name !== undefined || v.category !== undefined)
      .parse(request.body);
    const current = db.select().from(favorites).where(and(eq(favorites.id, id), eq(favorites.userId, user.id))).get();
    if (!current) throw notFound();
    // A favorite of one food keeps its category on that food too, so the entries it makes get it.
    const foods = parseFoods(current.foods);
    const set = foods?.length === 1 && b.category !== undefined ? { ...b, foods: JSON.stringify([{ ...foods[0], category: b.category }]) } : b;
    const row = db.update(favorites).set(set).where(eq(favorites.id, id)).returning().get();
    return toFavorite(row);
  });

  /** The favorite editor: name, usual meal and foods all replaced; the count of uses stays. */
  app.put('/favorites/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const m = mealBody.parse(request.body);
    checkSlot(user.id, m.slotId);
    const row = db
      .update(favorites)
      .set({ name: m.name, slotId: m.slotId ?? null, ...mealColumns(cleanFoods(m.foods)) })
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

  /** Logs a favorite into a slot in one call: one entry per food. */
  app.post('/favorites/:id/use', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const b = z.object({ slotId: zId, date: zDate }).parse(request.body);
    const fav = db.select().from(favorites).where(and(eq(favorites.id, id), eq(favorites.userId, user.id))).get();
    if (!fav) throw notFound();
    const slot = db.select().from(slots).where(and(eq(slots.id, b.slotId), eq(slots.userId, user.id))).get();
    if (!slot) throw badRequest('slot');
    const created = db.transaction((tx) => {
      const rows = favoriteFoods(fav).map((food) =>
        tx
          .insert(entries)
          .values({
            userId: user.id,
            slotId: slot.id,
            date: b.date,
            description: food.description,
            quantity: food.quantity,
            ...Object.fromEntries(NUTRIENTS.map((n) => [n, food[n]])),
            detail: food.items ? JSON.stringify(food.items) : null,
            category: food.category,
            source: 'favorite' as const,
            calcStatus: 'manual' as const
          })
          .returning()
          .get()
      );
      tx.update(favorites).set({ uses: sql`${favorites.uses} + 1` }).where(eq(favorites.id, fav.id)).run();
      return rows;
    });
    return created.map(toEntry);
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
        category: latest.category,
        times
      }));
  });
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ALL_DAYS, NUTRIENTS, addDays, todayIn, type CalendarResponse, type DayResponse, type Threshold } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import { entries, photos, slotSkips, slots, thresholds } from '../db/schema.ts';
import { aiStatus, deletePhoto } from '../ai.ts';
import { badRequest, notFound } from '../http.ts';
import { buildDay, calendarDays, thresholdsOn, toEntry, toSlot, userSlots } from '../services.ts';
import {
  zAmount,
  zDate,
  zDays,
  zId,
  zName,
  zNutrient,
  zOptionalText,
  zEstimateItem,
  zFoodCategory,
  zTime
} from '../validation.ts';

export async function diaryRoutes(app: FastifyInstance, { db, ai }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireUser(request);
  });

  // ---------- Slots ----------

  app.get('/slots', async (request) => {
    const user = requireUser(request);
    const { archived, date } = z
      .object({ archived: z.enum(['0', '1']).optional(), date: zDate.optional() })
      .parse(request.query);
    const list = userSlots(db, user.id, archived === '1');
    // With a date: also the slots added to that day only.
    if (date) {
      const extra = db
        .select()
        .from(slots)
        .where(and(eq(slots.userId, user.id), eq(slots.date, date), eq(slots.archived, false)))
        .all();
      list.push(...extra);
    }
    return list.map(toSlot);
  });

  const slotBody = z.object({
    name: zName,
    time: zTime,
    days: zDays.default(ALL_DAYS),
    reminderEnabled: z.boolean().default(true),
    reminderDelayMin: z.number().int().min(0).max(240).default(15)
  });

  app.post('/slots', async (request) => {
    const user = requireUser(request);
    // With a date, the slot exists on that day only (an extra meal) and sends no reminder.
    const { date, ...body } = slotBody.extend({ date: zDate.optional() }).parse(request.body);
    if (date) body.reminderEnabled = false;
    const max = db
      .select({ p: sql<number>`coalesce(max(${slots.position}), -1)` })
      .from(slots)
      .where(eq(slots.userId, user.id))
      .get();
    const row = db
      .insert(slots)
      .values({ ...body, date: date ?? null, userId: user.id, position: Number(max?.p ?? -1) + 1 })
      .returning()
      .get();
    return toSlot(row);
  });

  app.patch('/slots/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const body = slotBody.partial().extend({ archived: z.boolean().optional() }).parse(request.body);
    const row = db
      .update(slots)
      .set(body)
      .where(and(eq(slots.id, id), eq(slots.userId, user.id)))
      .returning()
      .get();
    if (!row) throw notFound();
    return toSlot(row);
  });

  // Slots are archived, never deleted, so past entries keep their slot.
  app.delete('/slots/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const row = db
      .update(slots)
      .set({ archived: true })
      .where(and(eq(slots.id, id), eq(slots.userId, user.id)))
      .returning()
      .get();
    if (!row) throw notFound();
    return toSlot(row);
  });

  app.put('/slots/order', async (request) => {
    const user = requireUser(request);
    const { ids } = z.object({ ids: z.array(zId).max(100) }).parse(request.body);
    db.transaction((tx) => {
      ids.forEach((id, position) => {
        tx.update(slots)
          .set({ position })
          .where(and(eq(slots.id, id), eq(slots.userId, user.id)))
          .run();
      });
    });
    return userSlots(db, user.id, false).map(toSlot);
  });

  // ---------- Entries ----------

  const entryBody = z.object({
    slotId: zId,
    date: zDate,
    description: z.string().trim().min(1).max(1000),
    quantity: zOptionalText(200),
    kcal: zAmount.default(null),
    protein: zAmount.default(null),
    carbs: zAmount.default(null),
    fat: zAmount.default(null),
    fiber: zAmount.default(null),
    notes: zOptionalText(2000),
    category: zFoodCategory.optional(),
    // Values that came from an in-app estimate: the per-food breakdown and whether the user edited them.
    items: z.array(zEstimateItem).max(50).nullable().optional(),
    estimate: z.enum(['none', 'calculated', 'corrected']).optional(),
    photoId: z.string().uuid().nullable().optional(),
    // Save now, estimate in the background (in-app AI must be enabled).
    calculate: z.boolean().optional(),
    // Sent again with the same id (offline queue, lost answer), an entry is not saved twice.
    clientId: z.string().uuid().optional()
  });

  const ownPhoto = (userId: number, photoId: string | null | undefined) =>
    !photoId || !!db.select().from(photos).where(and(eq(photos.id, photoId), eq(photos.userId, userId))).get();

  function storedFields(body: Partial<z.infer<typeof entryBody>>) {
    const { items, estimate, calculate, ...rest } = body;
    void calculate;
    const out: Partial<typeof entries.$inferInsert> = { ...rest };
    if (items !== undefined) out.detail = items ? JSON.stringify(items) : null;
    if (estimate === 'calculated' || estimate === 'corrected') {
      out.source = 'in_app';
      out.calcStatus = estimate;
      out.calcError = null;
    }
    return out;
  }

  const ownSlot = (userId: number, slotId: number) =>
    db.select().from(slots).where(and(eq(slots.id, slotId), eq(slots.userId, userId))).get();

  app.get('/entries/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const row = db
      .select()
      .from(entries)
      .where(and(eq(entries.id, id), eq(entries.userId, user.id)))
      .get();
    if (!row) throw notFound();
    return toEntry(row);
  });

  type EntryBody = z.infer<typeof entryBody>;

  function checkEntry(userId: number, body: EntryBody) {
    if (!ownSlot(userId, body.slotId)) throw badRequest('slot');
    if (!ownPhoto(userId, body.photoId)) throw badRequest('photo');
  }

  function insertEntry(dbOrTx: Pick<typeof db, 'insert' | 'select'>, userId: number, body: EntryBody, background: boolean) {
    const sent =
      body.clientId &&
      dbOrTx.select().from(entries).where(and(eq(entries.userId, userId), eq(entries.clientId, body.clientId))).get();
    if (sent) return sent;
    return dbOrTx
      .insert(entries)
      .values({
        source: 'manual',
        calcStatus: background && body.calculate === true ? 'pending' : 'manual',
        ...storedFields(body),
        slotId: body.slotId,
        date: body.date,
        description: body.description,
        userId
      })
      .returning()
      .get();
  }

  // Whether entries saved without values can be estimated in the background right now.
  const canEstimate = (user: Parameters<typeof aiStatus>[2]) => {
    const status = aiStatus(db, ai.secrets, user);
    return status.enabled && !status.capReached && !status.limitReached;
  };

  app.post('/entries', async (request) => {
    const user = requireUser(request);
    const body = entryBody.parse(request.body);
    checkEntry(user.id, body);
    const background = body.calculate === true && canEstimate(user);
    const row = insertEntry(db, user.id, body, background);
    if (background) ai.kick();
    return toEntry(row);
  });

  // A meal with several foods: one entry per food, all saved or none.
  app.post('/entries/batch', async (request) => {
    const user = requireUser(request);
    const { entries: list } = z.object({ entries: z.array(entryBody).min(1).max(30) }).parse(request.body);
    for (const body of list) checkEntry(user.id, body);
    const background = list.some((b) => b.calculate === true) && canEstimate(user);
    const rows = db.transaction((tx) => list.map((body) => insertEntry(tx, user.id, body, background)));
    if (background) ai.kick();
    return rows.map(toEntry);
  });

  app.patch('/entries/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const body = entryBody.omit({ clientId: true }).partial().parse(request.body);
    const current = db
      .select()
      .from(entries)
      .where(and(eq(entries.id, id), eq(entries.userId, user.id)))
      .get();
    if (!current) throw notFound();
    if (body.slotId && !ownSlot(user.id, body.slotId)) throw badRequest('slot');
    if (!ownPhoto(user.id, body.photoId)) throw badRequest('photo');
    const touchesValues = NUTRIENTS.some((n) => body[n] !== undefined && body[n] !== current[n]);
    const calcStatus =
      touchesValues && current.calcStatus === 'calculated' ? 'corrected' : current.calcStatus;
    const row = db
      .update(entries)
      .set({ calcStatus, ...storedFields(body), updatedAt: new Date().toISOString() })
      .where(and(eq(entries.id, id), eq(entries.userId, user.id)))
      .returning()
      .get();
    return toEntry(row!);
  });

  // Several entries at once, e.g. a whole slot cleared with a swipe.
  app.post('/entries/delete', async (request) => {
    const user = requireUser(request);
    const { ids } = z.object({ ids: z.array(zId).min(1).max(200) }).parse(request.body);
    const rows = db
      .delete(entries)
      .where(and(eq(entries.userId, user.id), inArray(entries.id, ids)))
      .returning()
      .all();
    for (const row of rows) if (row.photoId) deletePhoto(ai, user.id, row.photoId);
    return { deleted: rows.length };
  });

  app.delete('/entries/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const row = db
      .delete(entries)
      .where(and(eq(entries.id, id), eq(entries.userId, user.id)))
      .returning()
      .get();
    if (row?.photoId) deletePhoto(ai, user.id, row.photoId);
    return { ok: true };
  });

  // ---------- Day view ----------

  app.get('/day/:date', async (request): Promise<DayResponse> => {
    const user = requireUser(request);
    const { date } = z.object({ date: zDate }).parse(request.params);
    return buildDay(db, user, date);
  });

  // A skipped meal counts as filled and gets no reminder; logging something in the slot undoes it.
  app.put('/day/:date/skip/:slotId', async (request) => {
    const user = requireUser(request);
    const { date, slotId } = z.object({ date: zDate, slotId: zId }).parse(request.params);
    if (!ownSlot(user.id, slotId)) throw notFound();
    db.insert(slotSkips).values({ userId: user.id, slotId, date }).onConflictDoNothing().run();
    return { ok: true };
  });

  app.delete('/day/:date/skip/:slotId', async (request) => {
    const user = requireUser(request);
    const { date, slotId } = z.object({ date: zDate, slotId: zId }).parse(request.params);
    db.delete(slotSkips)
      .where(and(eq(slotSkips.userId, user.id), eq(slotSkips.slotId, slotId), eq(slotSkips.date, date)))
      .run();
    return { ok: true };
  });

  // Month view: for each day, slots with a meal or skipped out of the slots of that day.
  app.get('/calendar', async (request): Promise<CalendarResponse> => {
    const user = requireUser(request);
    const { from, to } = z.object({ from: zDate, to: zDate }).parse(request.query);
    if (from > to || addDays(from, 62) < to) throw badRequest('range');
    // From the sign-up day, or from the first meal if older days were logged afterwards.
    const signup = todayIn(user.timezone, new Date(user.createdAt));
    const first = db
      .select({ date: sql<string | null>`min(${entries.date})` })
      .from(entries)
      .where(eq(entries.userId, user.id))
      .get()?.date;
    const since = first && first < signup ? first : signup;
    return { since, days: calendarDays(db, user.id, from, to) };
  });

  // ---------- Thresholds ----------

  app.get('/thresholds', async (request): Promise<Threshold[]> => {
    const user = requireUser(request);
    const current = thresholdsOn(db, user.id, todayIn(user.timezone));
    return NUTRIENTS.map((nutrient) => ({
      nutrient,
      min: current[nutrient].min,
      max: current[nutrient].max,
      validFrom: current[nutrient].validFrom ?? todayIn(user.timezone)
    }));
  });

  // Saving creates a new version valid from today, so past days keep the thresholds they had.
  app.put('/thresholds', async (request) => {
    const user = requireUser(request);
    const { items } = z
      .object({
        items: z
          .array(z.object({ nutrient: zNutrient, min: zAmount, max: zAmount }))
          .max(NUTRIENTS.length)
      })
      .parse(request.body);
    for (const item of items) {
      if (item.min != null && item.max != null && item.min > item.max) throw badRequest('thresholdRange');
    }
    const today = todayIn(user.timezone);
    db.transaction((tx) => {
      for (const item of items) {
        tx.delete(thresholds)
          .where(
            and(
              eq(thresholds.userId, user.id),
              eq(thresholds.nutrient, item.nutrient),
              eq(thresholds.validFrom, today)
            )
          )
          .run();
        tx.insert(thresholds)
          .values({ userId: user.id, nutrient: item.nutrient, min: item.min, max: item.max, validFrom: today })
          .run();
      }
    });
    return { ok: true };
  });
}

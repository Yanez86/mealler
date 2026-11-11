// SPDX-License-Identifier: AGPL-3.0-or-later
// Trends over a period, data export, and bulk background estimates for a day.
import type { FastifyInstance } from 'fastify';
import { and, asc, between, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  NUTRIENTS,
  addDays,
  mealCategory,
  sumValues,
  todayIn,
  type Nutrient,
  type TrendDay,
  type TrendsResponse
} from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import { entries, favorites, slots, thresholds, water, weights } from '../db/schema.ts';
import { badRequest } from '../http.ts';
import { parseItems, toEntry, toSlot, toUser, waterByDay } from '../services.ts';
import { zDate } from '../validation.ts';
import { aiStatus } from '../ai.ts';
import { userAchievements } from '../achievements.ts';

const MAX_DAYS = 366;

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

const csvCell = (v: unknown) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function insightRoutes(app: FastifyInstance, { db, ai }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireUser(request);
  });

  const range = z
    .object({ from: zDate, to: zDate })
    .refine((r) => r.from <= r.to && r.from >= addDays(r.to, -(MAX_DAYS - 1)), { message: 'range' });

  app.get('/achievements', async (request) => userAchievements(db, requireUser(request)));

  app.get('/trends', async (request): Promise<TrendsResponse> => {
    const user = requireUser(request);
    const { from, to } = range.parse(request.query);
    const rows = db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, user.id), between(entries.date, from, to)))
      .all()
      .map(toEntry);
    const limits = db
      .select()
      .from(thresholds)
      .where(eq(thresholds.userId, user.id))
      .orderBy(asc(thresholds.validFrom), asc(thresholds.id))
      .all();
    const drunk = waterByDay(db, user.id, from, to);
    const days: TrendDay[] = daysBetween(from, to).map((date) => {
      const list = rows.filter((e) => e.date === date);
      const totals = sumValues(list);
      const dayLimits = {} as TrendDay['limits'];
      for (const n of NUTRIENTS) {
        let current: { min: number | null; max: number | null } = { min: null, max: null };
        for (const l of limits) if (l.nutrient === n && l.validFrom <= date) current = { min: l.min, max: l.max };
        dayLimits[n] = current;
      }
      return { date, entries: list.length, ...totals, limits: dayLimits, water: drunk.get(date) ?? 0 };
    });
    return { from, to, days };
  });

  app.get('/export.csv', async (request, reply) => {
    const user = requireUser(request);
    const { from, to } = range.parse(request.query);
    const slotNames = new Map(
      db.select().from(slots).where(eq(slots.userId, user.id)).all().map((s) => [s.id, s] as const)
    );
    const rows = db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, user.id), between(entries.date, from, to)))
      .orderBy(asc(entries.date), asc(entries.createdAt))
      .all();
    const header = ['date', 'slot', 'slot_time', 'description', 'quantity', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'source', 'notes', 'category'];
    const lines = rows.map((r) =>
      [
        r.date,
        slotNames.get(r.slotId)?.name,
        slotNames.get(r.slotId)?.time,
        r.description,
        r.quantity,
        r.kcal,
        r.protein,
        r.carbs,
        r.fat,
        r.fiber,
        r.source,
        r.notes,
        // Chosen by the user, otherwise guessed from the description.
        r.category ?? mealCategory([r.description], parseItems(r.detail))
      ]
        .map(csvCell)
        .join(',')
    );
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="mealler-${from}_${to}.csv"`);
    // The BOM lets spreadsheet apps detect UTF-8 (accents in food names).
    return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
  });

  app.get('/export.json', async (request, reply) => {
    const user = requireUser(request);
    const data = {
      format: 'mealler-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: toUser(user),
      slots: db.select().from(slots).where(eq(slots.userId, user.id)).all().map(toSlot),
      entries: db.select().from(entries).where(eq(entries.userId, user.id)).orderBy(asc(entries.date)).all().map(toEntry),
      thresholds: db
        .select({ nutrient: thresholds.nutrient, min: thresholds.min, max: thresholds.max, validFrom: thresholds.validFrom })
        .from(thresholds)
        .where(eq(thresholds.userId, user.id))
        .all(),
      weights: db
        .select({ date: weights.date, kg: weights.kg, note: weights.note })
        .from(weights)
        .where(eq(weights.userId, user.id))
        .orderBy(asc(weights.date))
        .all(),
      water: db
        .select({ date: water.date, ml: water.ml, at: water.createdAt })
        .from(water)
        .where(eq(water.userId, user.id))
        .orderBy(asc(water.date), asc(water.createdAt))
        .all(),
      favorites: db.select().from(favorites).where(eq(favorites.userId, user.id)).all()
    };
    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="mealler-export-${todayIn(user.timezone)}.json"`);
    return JSON.stringify(data, null, 2);
  });

  /** Queues every entry of a day that has no values for a background estimate. */
  app.post('/day/:date/calculate', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const user = requireUser(request);
    const { date } = z.object({ date: zDate }).parse(request.params);
    const status = aiStatus(db, ai.secrets, user);
    if (!status.enabled) throw badRequest('aiDisabled');
    const empty = NUTRIENTS.map((n: Nutrient) => isNull(entries[n]));
    const queued = db
      .update(entries)
      .set({ calcStatus: 'pending', calcError: null })
      .where(and(eq(entries.userId, user.id), eq(entries.date, date), eq(entries.calcStatus, 'manual'), ...empty))
      .returning({ id: entries.id })
      .all();
    if (queued.length) ai.kick();
    return { queued: queued.length };
  });
}

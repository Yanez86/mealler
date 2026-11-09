// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { and, asc, between, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type WeightEntry } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import type { Db } from '../db/index.ts';
import { weights } from '../db/schema.ts';
import { zDate, zOptionalText } from '../validation.ts';

const toWeight = (row: typeof weights.$inferSelect): WeightEntry => ({ date: row.date, kg: row.kg, note: row.note });

export function listWeights(db: Db, userId: number, from: string, to: string): WeightEntry[] {
  return db
    .select()
    .from(weights)
    .where(and(eq(weights.userId, userId), between(weights.date, from, to)))
    .orderBy(asc(weights.date))
    .all()
    .map(toWeight);
}

export function saveWeight(db: Db, userId: number, date: string, kg: number, note: string | null): WeightEntry {
  // Two decimals, so a weight typed in pounds reads back the same (0.01 kg is about 0.02 lb).
  const value = Math.round(kg * 100) / 100;
  return toWeight(
    db
      .insert(weights)
      .values({ userId, date, kg: value, note })
      .onConflictDoUpdate({ target: [weights.userId, weights.date], set: { kg: value, note } })
      .returning()
      .get()
  );
}

export function lastWeight(db: Db, userId: number, beforeOrOn?: string): WeightEntry | null {
  const where = beforeOrOn
    ? and(eq(weights.userId, userId), between(weights.date, '0000-01-01', beforeOrOn))
    : eq(weights.userId, userId);
  const row = db.select().from(weights).where(where).orderBy(desc(weights.date)).get();
  return row ? toWeight(row) : null;
}

export async function weightRoutes(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireUser(request);
  });

  app.get('/weights', async (request) => {
    const user = requireUser(request);
    const { from, to } = z.object({ from: zDate, to: zDate }).parse(request.query);
    return listWeights(db, user.id, from, to);
  });

  app.get('/weights/last', async (request) => {
    const user = requireUser(request);
    return { last: lastWeight(db, user.id) };
  });

  app.put('/weights/:date', async (request) => {
    const user = requireUser(request);
    const { date } = z.object({ date: zDate }).parse(request.params);
    const body = z.object({ kg: z.number().min(20).max(400), note: zOptionalText(500) }).parse(request.body);
    return saveWeight(db, user.id, date, body.kg, body.note ?? null);
  });

  app.delete('/weights/:date', async (request) => {
    const user = requireUser(request);
    const { date } = z.object({ date: zDate }).parse(request.params);
    db.delete(weights).where(and(eq(weights.userId, user.id), eq(weights.date, date))).run();
    return { ok: true };
  });
}

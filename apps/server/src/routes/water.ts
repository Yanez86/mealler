// SPDX-License-Identifier: AGPL-3.0-or-later
// Water drunk during the day: each "+ Glass" is a row, "−" removes the latest of the day.
import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WaterDay } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import type { Db } from '../db/index.ts';
import { water } from '../db/schema.ts';
import { waterOn } from '../services.ts';
import { zDate } from '../validation.ts';

/** Most a single drink can be: a big bottle. */
export const MAX_DRINK_ML = 3000;

export function addWater(db: Db, userId: number, date: string, ml: number): WaterDay {
  db.insert(water).values({ userId, date, ml: Math.round(ml) }).run();
  return { date, ml: waterOn(db, userId, date) };
}

export function removeLastWater(db: Db, userId: number, date: string): WaterDay {
  const last = db
    .select({ id: water.id })
    .from(water)
    .where(and(eq(water.userId, userId), eq(water.date, date)))
    .orderBy(desc(water.createdAt), desc(water.id))
    .get();
  if (last) db.delete(water).where(eq(water.id, last.id)).run();
  return { date, ml: waterOn(db, userId, date) };
}

export async function waterRoutes(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireUser(request);
  });

  app.post('/water', async (request): Promise<WaterDay> => {
    const user = requireUser(request);
    const b = z.object({ date: zDate, ml: z.number().int().min(1).max(MAX_DRINK_ML) }).parse(request.body);
    return addWater(db, user.id, b.date, b.ml);
  });

  app.delete('/water/:date/last', async (request): Promise<WaterDay> => {
    const user = requireUser(request);
    const { date } = z.object({ date: zDate }).parse(request.params);
    return removeLastWater(db, user.id, date);
  });
}

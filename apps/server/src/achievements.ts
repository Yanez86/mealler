// SPDX-License-Identifier: AGPL-3.0-or-later
// Achievements worked out from the diary itself, so they count retroactively. Once unlocked they are
// stored, and stay even if the data that earned them is deleted later.
import { and, asc, eq, isNotNull, min, sql } from 'drizzle-orm';
import {
  ACHIEVEMENTS,
  NUTRIENTS,
  addDays,
  isoWeekday,
  mealCategory,
  sumValues,
  thresholdStatus,
  todayIn,
  type AchievementState
} from '@mealler/shared';
import type { Db } from './db/index.ts';
import { achievements, entries, favorites, oauthTokens, products, slots, thresholds, water, weights } from './db/schema.ts';
import type { UserRow } from './auth.ts';
import { calendarDays, toEntry } from './services.ts';

/** First of the `dates` (sorted, unique) where `step` days apart they reach a run of `n`, and the longest run. */
export function streak(dates: string[], n: number, step = 1): { at: string | null; best: number } {
  let run = 0;
  let best = 0;
  let at: string | null = null;
  dates.forEach((d, i) => {
    run = i > 0 && addDays(dates[i - 1], step) === d ? run + 1 : 1;
    best = Math.max(best, run);
    if (run >= n && !at) at = d;
  });
  return { at, best };
}

const uniq = (dates: string[]) => [...new Set(dates)].sort();
const nth = (dates: string[], n: number) => (dates.length >= n ? dates[n - 1] : null);

export function userAchievements(db: Db, user: UserRow): AchievementState[] {
  const tz = user.timezone;
  const today = todayIn(tz);
  const localDay = (iso: string) => todayIn(tz, new Date(iso));
  const rows = db
    .select()
    .from(entries)
    .where(eq(entries.userId, user.id))
    .orderBy(asc(entries.date), asc(entries.createdAt))
    .all();
  const list = rows.map(toEntry);

  // Complete days: every meal of the day logged or skipped, as in the calendar.
  const signup = localDay(user.createdAt);
  const since = list[0] && list[0].date < signup ? list[0].date : signup;
  const complete = calendarDays(db, user.id, since, today)
    .filter((d) => d.total > 0 && d.filled === d.total)
    .map((d) => d.date);

  // Days within every threshold that is set (complete days only, so half a day does not count).
  const limits = db.select().from(thresholds).where(eq(thresholds.userId, user.id)).orderBy(asc(thresholds.validFrom), asc(thresholds.id)).all();
  const byDate = new Map<string, typeof list>();
  for (const e of list) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const inRange = complete.filter((date) => {
    const totals = sumValues(byDate.get(date) ?? []);
    const status = NUTRIENTS.map((n) => {
      let cur = { min: null as number | null, max: null as number | null };
      for (const l of limits) if (l.nutrient === n && l.validFrom <= date) cur = l;
      return thresholdStatus(totals[n], cur.min, cur.max);
    });
    return status.some((s) => s === 'ok') && status.every((s) => s === 'ok' || s === 'none');
  });

  // Food categories per day.
  let rainbowAt: string | null = null;
  let rainbowBest = 0;
  for (const [date, dayList] of byDate) {
    const cats = new Set(dayList.map((e) => e.category ?? mealCategory([e.description], e.items)));
    cats.delete('other');
    rainbowBest = Math.max(rainbowBest, cats.size);
    if (cats.size >= 5 && !rainbowAt) rainbowAt = date;
  }

  const scans = db
    .select({ date: entries.date, product: entries.productId })
    .from(entries)
    .innerJoin(products, eq(products.id, entries.productId))
    .where(and(eq(entries.userId, user.id), isNotNull(products.barcode)))
    .orderBy(asc(entries.date))
    .all();
  const seen = new Set<number | null>();
  const newScans = scans.filter((s) => !seen.has(s.product) && seen.add(s.product)).map((s) => s.date);

  const weighDays = db.select({ date: weights.date }).from(weights).where(eq(weights.userId, user.id)).orderBy(asc(weights.date)).all().map((w) => w.date);
  // Days the water goal was reached (the goal set now, for every day).
  const waterGoal = user.waterGoalMl;
  const watered = db
    .select({ date: water.date, ml: sql<number>`sum(${water.ml})` })
    .from(water)
    .where(eq(water.userId, user.id))
    .groupBy(water.date)
    .orderBy(asc(water.date))
    .all()
    .filter((d) => d.ml >= waterGoal)
    .map((d) => d.date);
  const w7 = streak(watered, 7);
  const w30 = streak(watered, 30);

  const weekOf = (d: string) => addDays(d, 1 - isoWeekday(d));
  const weeks = streak(uniq(weighDays.map(weekOf)), 12, 7);

  const breakfastSlots = new Set(db.select().from(slots).where(eq(slots.userId, user.id)).all().filter((s) => s.time < '11:00').map((s) => s.id));
  const breakfast = streak(uniq(list.filter((e) => breakfastSlots.has(e.slotId)).map((e) => e.date)), 7);

  const firstOf = (table: typeof favorites | typeof oauthTokens) =>
    db.select({ at: min(table.createdAt) }).from(table).where(eq(table.userId, user.id)).get()?.at ?? null;
  const label = db
    .select({ at: min(products.updatedAt) })
    .from(products)
    .where(and(eq(products.createdBy, user.id), isNotNull(products.labelMime)))
    .get()?.at;
  const hour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
  const midnight = rows.find((e) => hour(e.createdAt) < 4);

  const s3 = streak(complete, 3);
  const s7 = streak(complete, 7);
  const s30 = streak(complete, 30);
  const r7 = streak(inRange, 7);
  const first = (dates: string[]) => dates[0] ?? null;
  const dated = (iso: string | null | undefined) => (iso ? localDay(iso) : null);

  const found: Record<string, { at: string | null; progress: number }> = {
    scan1: { at: first(newScans), progress: newScans.length },
    day1: { at: first(complete), progress: complete.length },
    dish1: { at: list.find((e) => (e.items?.length ?? 0) >= 2)?.date ?? null, progress: 0 },
    estimate1: {
      at: list.find((e) => e.source === 'in_app' || e.source === 'claude_ai' || e.calcStatus === 'calculated' || e.calcStatus === 'corrected')?.date ?? null,
      progress: 0
    },
    weight1: { at: first(weighDays), progress: weighDays.length },
    label1: { at: dated(label), progress: 0 },
    favorite1: { at: dated(firstOf(favorites)), progress: 0 },
    streak3: { at: s3.at, progress: s3.best },
    streak7: { at: s7.at, progress: s7.best },
    streak30: { at: s30.at, progress: s30.best },
    days100: { at: nth(complete, 100), progress: complete.length },
    days365: { at: nth(complete, 365), progress: complete.length },
    weights10: { at: nth(weighDays, 10), progress: weighDays.length },
    weeks12: { at: weeks.at, progress: weeks.best },
    water1: { at: first(watered), progress: watered.length },
    water7: { at: w7.at, progress: w7.best },
    water30: { at: w30.at, progress: w30.best },
    inrange1: { at: first(inRange), progress: inRange.length },
    inrange7: { at: r7.at, progress: r7.best },
    rainbow: { at: rainbowAt, progress: rainbowBest },
    entries100: { at: nth(list.map((e) => e.date), 100), progress: list.length },
    entries1000: { at: nth(list.map((e) => e.date), 1000), progress: list.length },
    scans50: { at: nth(newScans, 50), progress: newScans.length },
    breakfast7: { at: breakfast.at, progress: breakfast.best },
    connector: { at: dated(firstOf(oauthTokens)), progress: 0 },
    midnight: { at: midnight ? localDay(midnight.createdAt) : null, progress: 0 }
  };

  // A future-dated entry does not unlock anything before its day.
  const stored = new Map(db.select().from(achievements).where(eq(achievements.userId, user.id)).all().map((r) => [r.id, r.at]));
  const out = ACHIEVEMENTS.map(({ id, target }): AchievementState => {
    const f = found[id];
    const earned = f.at && f.at <= today ? f.at : null;
    const at = stored.get(id) ?? earned;
    if (at && !stored.has(id)) db.insert(achievements).values({ userId: user.id, id, at }).onConflictDoNothing().run();
    return { id, at, progress: at ? target : Math.min(f.progress, target) };
  });
  return out;
}

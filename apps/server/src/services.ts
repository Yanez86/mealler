// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, between, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import {
  ALL_DAYS,
  DEFAULT_SLOTS,
  NUTRIENTS,
  addDays,
  isLocale,
  isUnitSystem,
  kcalMismatch,
  slotActiveOn,
  sumValues,
  thresholdStatus,
  todayIn,
  type CalendarDay,
  type DayResponse,
  type Entry,
  type EstimateItem,
  type Locale,
  type Nutrient,
  type NutrientSummary,
  type Slot,
  type User
} from '@mealler/shared';
import type { Db } from './db/index.ts';
import { entries, settings, slotSkips, slots, thresholds, users, water } from './db/schema.ts';
import type { UserRow } from './auth.ts';

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    locale: isLocale(row.locale) ? row.locale : 'it',
    timezone: row.timezone,
    theme: row.theme,
    units: isUnitSystem(row.units) ? row.units : 'metric',
    active: row.active,
    remindersEnabled: row.remindersEnabled,
    quietStart: row.quietStart,
    quietEnd: row.quietEnd,
    remindersPausedUntil: row.remindersPausedUntil,
    lastSeenVersion: row.lastSeenVersion,
    weightReminderEnabled: row.weightReminderEnabled,
    weightReminderWeeks: row.weightReminderWeeks,
    weightReminderWeekday: row.weightReminderWeekday,
    weightReminderTime: row.weightReminderTime,
    waterEnabled: row.waterEnabled,
    waterGoalMl: row.waterGoalMl,
    waterGlassMl: row.waterGlassMl,
    waterReminderEnabled: row.waterReminderEnabled,
    waterReminderHours: row.waterReminderHours,
    waterReminderStart: row.waterReminderStart,
    waterReminderEnd: row.waterReminderEnd,
    meatFree: row.meatFree
  };
}

export function toSlot(row: typeof slots.$inferSelect): Slot {
  return {
    id: row.id,
    name: row.name,
    time: row.time,
    days: row.days,
    position: row.position,
    reminderEnabled: row.reminderEnabled,
    reminderDelayMin: row.reminderDelayMin,
    archived: row.archived,
    date: row.date
  };
}

export function toEntry(row: typeof entries.$inferSelect): Entry {
  const values = { kcal: row.kcal, protein: row.protein, carbs: row.carbs, fat: row.fat, fiber: row.fiber };
  return {
    id: row.id,
    slotId: row.slotId,
    date: row.date,
    description: row.description,
    quantity: row.quantity,
    ...values,
    source: row.source,
    calcStatus: row.calcStatus,
    notes: row.notes,
    kcalMismatch: kcalMismatch(values),
    photoId: row.photoId,
    calcError: row.calcError,
    items: parseItems(row.detail),
    productId: row.productId,
    amountG: row.amountG,
    category: row.category
  };
}

export function parseItems(detail: string | null): EstimateItem[] | null {
  if (!detail) return null;
  try {
    const value = JSON.parse(detail);
    return Array.isArray(value) ? (value as EstimateItem[]) : null;
  } catch {
    return null;
  }
}

export function countUsers(db: Db): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(users).get();
  return Number(row?.n ?? 0);
}

export function countActiveAdmins(db: Db): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true)))
    .get();
  return Number(row?.n ?? 0);
}

export function findUserByEmail(db: Db, email: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
}

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  locale: Locale;
  timezone: string;
}

/** Creates a user together with the default meal slots for their language. */
export function createUserWithDefaults(db: Db, input: NewUser): UserRow {
  return db.transaction((tx) => {
    const user = tx
      .insert(users)
      .values({
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        role: input.role,
        locale: input.locale,
        timezone: input.timezone
      })
      .returning()
      .get();
    DEFAULT_SLOTS[input.locale].forEach((slot, index) => {
      tx.insert(slots)
        .values({ userId: user.id, name: slot.name, time: slot.time, days: ALL_DAYS, position: index })
        .run();
    });
    return user;
  });
}

export function getSetting(db: Db, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export const isRegistrationOpen = (db: Db) => getSetting(db, 'registration_open') === 'true';

export interface ThresholdValue {
  min: number | null;
  max: number | null;
  validFrom: string | null;
}

/** Thresholds in force on a given date: for each nutrient, the latest version with valid_from <= date. */
export function thresholdsOn(db: Db, userId: number, date: string): Record<Nutrient, ThresholdValue> {
  const out = {} as Record<Nutrient, ThresholdValue>;
  for (const nutrient of NUTRIENTS) {
    const row = db
      .select()
      .from(thresholds)
      .where(and(eq(thresholds.userId, userId), eq(thresholds.nutrient, nutrient), lte(thresholds.validFrom, date)))
      .orderBy(desc(thresholds.validFrom), desc(thresholds.id))
      .get();
    out[nutrient] = { min: row?.min ?? null, max: row?.max ?? null, validFrom: row?.validFrom ?? null };
  }
  return out;
}

type SlotRow = typeof slots.$inferSelect;
const slotOrder = [asc(slots.position), asc(slots.time), asc(slots.id)];

/** The user's regular slots (not the ones added to a single day). */
export function userSlots(db: Db, userId: number, includeArchived: boolean) {
  const where = includeArchived
    ? and(eq(slots.userId, userId), isNull(slots.date))
    : and(eq(slots.userId, userId), eq(slots.archived, false), isNull(slots.date));
  return db.select().from(slots).where(where).orderBy(...slotOrder).all();
}

/** Regular slots plus the ones added to a day between `from` and `to`, archived ones included. */
function slotsForDays(db: Db, userId: number, from: string, to: string): SlotRow[] {
  return db
    .select()
    .from(slots)
    .where(and(eq(slots.userId, userId), or(isNull(slots.date), between(slots.date, from, to))))
    .orderBy(...slotOrder)
    .all();
}

/**
 * The slots of a day, in order: the regular ones active that day, the ones added to that day only
 * (placed by time), and any other slot that holds an entry.
 */
function slotsOfDay(all: SlotRow[], date: string, used: Set<number>): SlotRow[] {
  const regular = all.filter((s) => s.date == null && (used.has(s.id) || (!s.archived && slotActiveOn(s.days, date))));
  const extra = all.filter((s) => s.date === date && (used.has(s.id) || !s.archived));
  const out = [...regular];
  for (const slot of extra.sort((a, b) => a.time.localeCompare(b.time))) {
    const at = out.findIndex((s) => s.time > slot.time);
    out.splice(at < 0 ? out.length : at, 0, slot);
  }
  return out;
}

function skippedOn(db: Db, userId: number, from: string, to: string) {
  return db
    .select()
    .from(slotSkips)
    .where(and(eq(slotSkips.userId, userId), between(slotSkips.date, from, to)))
    .all();
}

/** Water drunk on a day, in ml. */
export function waterOn(db: Db, userId: number, date: string): number {
  return (
    db
      .select({ ml: sql<number | null>`sum(${water.ml})` })
      .from(water)
      .where(and(eq(water.userId, userId), eq(water.date, date)))
      .get()?.ml ?? 0
  );
}

/** Water per day between two dates (days without any are left out). */
export function waterByDay(db: Db, userId: number, from: string, to: string): Map<string, number> {
  const rows = db
    .select({ date: water.date, ml: sql<number>`sum(${water.ml})` })
    .from(water)
    .where(and(eq(water.userId, userId), between(water.date, from, to)))
    .groupBy(water.date)
    .all();
  return new Map(rows.map((r) => [r.date, r.ml]));
}

/** Everything the day view needs: slots active that day (plus any with entries), entries, totals vs thresholds. */
export function buildDay(db: Db, user: UserRow, date: string): DayResponse {
  const dayEntries = db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, user.id), eq(entries.date, date)))
    .orderBy(asc(entries.createdAt), asc(entries.id))
    .all()
    .map(toEntry);
  const used = new Set(dayEntries.map((e) => e.slotId));
  const skipped = new Set(skippedOn(db, user.id, date, date).map((s) => s.slotId));
  const daySlots = slotsOfDay(slotsForDays(db, user.id, date, date), date, used)
    .map(toSlot)
    .map((slot) => {
      const list = dayEntries.filter((e) => e.slotId === slot.id);
      return { slot, entries: list, totals: sumValues(list), skipped: list.length === 0 && skipped.has(slot.id) };
    });
  const totals = sumValues(dayEntries);
  const limits = thresholdsOn(db, user.id, date);
  const summary = {} as Record<Nutrient, NutrientSummary>;
  for (const n of NUTRIENTS) {
    const { min, max } = limits[n];
    summary[n] = { value: totals[n], min, max, status: thresholdStatus(totals[n], min, max) };
  }
  return { date, today: todayIn(user.timezone), slots: daySlots, summary, water: waterOn(db, user.id, date) };
}

/** For each day from `from` to `to`: how many of its slots have a meal or were skipped. */
export function calendarDays(db: Db, userId: number, from: string, to: string): CalendarDay[] {
  const all = slotsForDays(db, userId, from, to);
  const byDate = (rows: { date: string; slotId: number }[]) => {
    const map = new Map<string, Set<number>>();
    for (const r of rows) {
      if (!map.has(r.date)) map.set(r.date, new Set());
      map.get(r.date)!.add(r.slotId);
    }
    return map;
  };
  const used = byDate(
    db
      .selectDistinct({ date: entries.date, slotId: entries.slotId })
      .from(entries)
      .where(and(eq(entries.userId, userId), between(entries.date, from, to)))
      .all()
  );
  const skipped = byDate(skippedOn(db, userId, from, to));
  const none = new Set<number>();
  const out: CalendarDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const withMeals = used.get(date) ?? none;
    const skippedSlots = skipped.get(date) ?? none;
    // The same slots as the day view, so "complete" here matches "5 of 5 filled" there.
    const list = slotsOfDay(all, date, withMeals);
    const filled = list.filter((s) => withMeals.has(s.id) || skippedSlots.has(s.id)).length;
    out.push({ date, filled, total: list.length });
  }
  return out;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import {
  ALL_DAYS,
  DEFAULT_SLOTS,
  NUTRIENTS,
  isLocale,
  kcalMismatch,
  slotActiveOn,
  sumValues,
  thresholdStatus,
  todayIn,
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
import { entries, settings, slots, thresholds, users } from './db/schema.ts';
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
    active: row.active,
    remindersEnabled: row.remindersEnabled,
    quietStart: row.quietStart,
    quietEnd: row.quietEnd,
    remindersPausedUntil: row.remindersPausedUntil,
    lastSeenVersion: row.lastSeenVersion,
    weightReminderEnabled: row.weightReminderEnabled,
    weightReminderWeeks: row.weightReminderWeeks,
    weightReminderWeekday: row.weightReminderWeekday,
    weightReminderTime: row.weightReminderTime
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
    archived: row.archived
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
    items: parseItems(row.detail)
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

export function userSlots(db: Db, userId: number, includeArchived: boolean) {
  const where = includeArchived
    ? eq(slots.userId, userId)
    : and(eq(slots.userId, userId), eq(slots.archived, false));
  return db.select().from(slots).where(where).orderBy(asc(slots.position), asc(slots.time), asc(slots.id)).all();
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
  const daySlots = userSlots(db, user.id, true)
    .filter((s) => used.has(s.id) || (!s.archived && slotActiveOn(s.days, date)))
    .map(toSlot)
    .map((slot) => {
      const list = dayEntries.filter((e) => e.slotId === slot.id);
      return { slot, entries: list, totals: sumValues(list) };
    });
  const totals = sumValues(dayEntries);
  const limits = thresholdsOn(db, user.id, date);
  const summary = {} as Record<Nutrient, NutrientSummary>;
  for (const n of NUTRIENTS) {
    const { min, max } = limits[n];
    summary[n] = { value: totals[n], min, max, status: thresholdStatus(totals[n], min, max) };
  }
  return { date, today: todayIn(user.timezone), slots: daySlots, summary };
}

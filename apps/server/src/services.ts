// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import {
  ALL_DAYS,
  DEFAULT_SLOTS,
  NUTRIENTS,
  isLocale,
  kcalMismatch,
  type Entry,
  type Locale,
  type Nutrient,
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
    remindersPausedUntil: row.remindersPausedUntil
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
    kcalMismatch: kcalMismatch(values)
  };
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

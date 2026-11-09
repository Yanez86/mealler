// SPDX-License-Identifier: AGPL-3.0-or-later
// Slot reminders: shortly after a slot's time, if the slot is still empty, notify the user's devices.
import { and, eq, sql } from 'drizzle-orm';
import {
  inTimeRange,
  isLocale,
  isoWeekday,
  nowIn,
  slotActiveOn,
  timeToMinutes,
  translate
} from '@mealler/shared';
import type { Db } from './db/index.ts';
import { entries, pushSubscriptions, reminderLog, slotSkips, slots, users } from './db/schema.ts';
import { pushToUser, type PushSender } from './push.ts';
import { lastWeight } from './routes/weight.ts';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** A reminder that could not be sent within this many minutes after it was due is skipped. */
export const REMINDER_WINDOW_MIN = 180;

export async function runReminderTick(db: Db, sender: PushSender, now: Date = new Date()): Promise<number> {
  let sent = 0;
  const candidates = db
    .selectDistinct({ user: users })
    .from(users)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    .where(and(eq(users.active, true), eq(users.remindersEnabled, true)))
    .all()
    .map((r) => r.user);

  for (const user of candidates) {
    const { date, time } = nowIn(user.timezone, now);
    if (user.remindersPausedUntil && user.remindersPausedUntil >= date) continue;
    if (inTimeRange(time, user.quietStart, user.quietEnd)) continue;
    const minutes = timeToMinutes(time);
    const locale = isLocale(user.locale) ? user.locale : 'it';

    // Weigh-in reminder: on the chosen weekday, if the last weigh-in is about N weeks old (or missing).
    if (user.weightReminderEnabled && isoWeekday(date) === user.weightReminderWeekday && user.weightReminderLastSent !== date) {
      const due = timeToMinutes(user.weightReminderTime);
      if (minutes >= due && minutes - due <= REMINDER_WINDOW_MIN) {
        const last = lastWeight(db, user.id, date);
        const since = last ? daysBetween(last.date, date) : Infinity;
        if (since >= user.weightReminderWeeks * 7 - 1) {
          const delivered = await pushToUser(db, sender, user.id, {
            title: translate(locale, 'push.weightTitle'),
            body: translate(locale, 'push.weightBody'),
            url: '/trends?tab=weight',
            tag: `weight-${date}`
          });
          if (delivered > 0) {
            db.update(users).set({ weightReminderLastSent: date }).where(eq(users.id, user.id)).run();
            sent++;
          }
        }
      }
    }

    const userSlots = db
      .select()
      .from(slots)
      .where(and(eq(slots.userId, user.id), eq(slots.archived, false), eq(slots.reminderEnabled, true)))
      .all();

    for (const slot of userSlots) {
      if (!slotActiveOn(slot.days, date)) continue;
      const due = timeToMinutes(slot.time) + slot.reminderDelayMin;
      if (minutes < due || minutes - due > REMINDER_WINDOW_MIN) continue;

      const already = db
        .select({ n: sql<number>`1` })
        .from(reminderLog)
        .where(and(eq(reminderLog.userId, user.id), eq(reminderLog.slotId, slot.id), eq(reminderLog.date, date)))
        .get();
      if (already) continue;

      const filled = db
        .select({ n: sql<number>`1` })
        .from(entries)
        .where(and(eq(entries.userId, user.id), eq(entries.slotId, slot.id), eq(entries.date, date)))
        .get();
      if (filled) continue;

      const skipped = db
        .select({ n: sql<number>`1` })
        .from(slotSkips)
        .where(and(eq(slotSkips.userId, user.id), eq(slotSkips.slotId, slot.id), eq(slotSkips.date, date)))
        .get();
      if (skipped) continue;

      const delivered = await pushToUser(db, sender, user.id, {
        title: `${slot.name} · ${slot.time}`,
        body: translate(locale, 'push.reminderBody'),
        url: `/add?slot=${slot.id}&d=${date}`,
        tag: `slot-${slot.id}-${date}`
      });
      if (delivered > 0) {
        db.insert(reminderLog)
          .values({ userId: user.id, slotId: slot.id, date, sentAt: now.toISOString() })
          .onConflictDoNothing()
          .run();
        sent++;
      }
    }
  }
  return sent;
}

/** Runs the reminder check every minute, never overlapping two runs. */
export function startReminderScheduler(db: Db, sender: PushSender, log: { error(o: unknown, m?: string): void }) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runReminderTick(db, sender);
    } catch (error) {
      log.error(error, 'reminder tick failed');
    } finally {
      running = false;
    }
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

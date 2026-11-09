// SPDX-License-Identifier: AGPL-3.0-or-later
import webpush from 'web-push';
import { and, asc, eq } from 'drizzle-orm';
import type { PushPayload } from '@mealler/shared';
import type { Config } from './config.ts';
import type { Db } from './db/index.ts';
import { pushSubscriptions, users } from './db/schema.ts';
import { getSetting, setSetting } from './services.ts';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 'gone' means the browser dropped the subscription and it should be deleted. */
export type PushResult = 'ok' | 'gone' | 'error';

export interface PushSender {
  publicKey: string;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

/** VAPID keys are generated on first start and kept in the settings table. */
export function vapidKeys(db: Db): { publicKey: string; privateKey: string } {
  const publicKey = getSetting(db, 'vapid_public');
  const privateKey = getSetting(db, 'vapid_private');
  if (publicKey && privateKey) return { publicKey, privateKey };
  const keys = webpush.generateVAPIDKeys();
  setSetting(db, 'vapid_public', keys.publicKey);
  setSetting(db, 'vapid_private', keys.privateKey);
  return keys;
}

export function createPushSender(db: Db, config: Config): PushSender {
  const { publicKey, privateKey } = vapidKeys(db);
  const subject = () => {
    if (config.baseUrl?.startsWith('https://')) return config.baseUrl;
    // Push services require a contact: use the first administrator's address.
    const admin = db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.id)).get();
    return `mailto:${admin?.email ?? 'admin@example.com'}`;
  };
  return {
    publicKey,
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject: subject(), publicKey, privateKey }, TTL: 60 * 60 }
        );
        return 'ok';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? 'gone' : 'error';
      }
    }
  };
}

/** Sends a payload to every device of a user. Returns how many devices accepted it. */
export async function pushToUser(db: Db, sender: PushSender, userId: number, payload: PushPayload): Promise<number> {
  const targets = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).all();
  let delivered = 0;
  for (const target of targets) {
    const result = await sender.send(target, payload);
    if (result === 'ok') {
      delivered++;
      db.update(pushSubscriptions)
        .set({ lastUsedAt: new Date().toISOString() })
        .where(eq(pushSubscriptions.id, target.id))
        .run();
    } else if (result === 'gone') {
      db.delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.id, target.id), eq(pushSubscriptions.userId, userId)))
        .run();
    }
  }
  return delivered;
}

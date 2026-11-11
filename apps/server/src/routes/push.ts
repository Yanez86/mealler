// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isLocale, translate } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireUser } from '../auth.ts';
import { pushSubscriptions } from '../db/schema.ts';
import { pushToUser } from '../push.ts';

export async function pushRoutes(app: FastifyInstance, { db, push }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireUser(request);
  });

  app.get('/key', async () => ({ publicKey: push.publicKey }));

  // The server posts to this address: only the push services of the browsers, never a host the user picks.
  const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
  const subscription = z.object({
    endpoint: z
      .string()
      .url()
      .max(2000)
      .refine((u) => u.startsWith('https://') && PUSH_HOSTS.test(new URL(u).hostname)),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) })
  });

  app.post('/subscribe', async (request) => {
    const user = requireUser(request);
    const body = subscription.parse(request.body);
    const values = {
      userId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers['user-agent']?.slice(0, 300) ?? null
    };
    // An endpoint belongs to one browser: if another account used it before, it moves to this one.
    db.insert(pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
      .run();
    return { ok: true };
  });

  app.post('/unsubscribe', async (request) => {
    const user = requireUser(request);
    const { endpoint } = z.object({ endpoint: z.string().max(2000) }).parse(request.body);
    db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)))
      .run();
    return { ok: true };
  });

  app.post('/test', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request) => {
    const user = requireUser(request);
    const locale = isLocale(user.locale) ? user.locale : 'it';
    const delivered = await pushToUser(db, push, user.id, {
      title: 'Mealler',
      body: translate(locale, 'push.testBody'),
      url: '/',
      tag: 'test'
    });
    return { delivered };
  });
}

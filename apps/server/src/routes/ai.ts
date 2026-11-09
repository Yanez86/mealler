// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AiSettings } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireAdmin, requireUser } from '../auth.ts';
import { aiUsage, photos, users } from '../db/schema.ts';
import { notFound } from '../http.ts';
import { aiSettingsBody, aiStatus, estimateMeal, readAiSettings, savePhoto, testApiKey, writeAiSettings } from '../ai.ts';

const MAX_PHOTO_BASE64 = 8 * 1024 * 1024;

export async function aiRoutes(app: FastifyInstance, { db, ai }: AppContext) {
  app.get('/ai/status', async (request) => aiStatus(db, ai.secrets, requireUser(request)));

  app.post(
    '/ai/estimate',
    { bodyLimit: 10 * 1024 * 1024, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const user = requireUser(request);
      const body = z
        .object({
          description: z.string().trim().max(1000).default(''),
          quantity: z.string().trim().max(200).nullable().optional(),
          photo: z
            .object({
              mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
              data: z.string().min(100).max(MAX_PHOTO_BASE64).regex(/^[A-Za-z0-9+/=]+$/)
            })
            .nullable()
            .optional()
        })
        .refine((b) => b.description.length > 0 || !!b.photo)
        .parse(request.body);
      const estimate = await estimateMeal(ai, user, { text: body.description, quantity: body.quantity, photo: body.photo });
      const settings = readAiSettings(db, ai.secrets);
      const photoId = body.photo && settings.keepPhotos ? savePhoto(ai, user, body.photo) : null;
      return { estimate, photoId };
    }
  );

  app.get('/photos/:id', async (request, reply) => {
    const user = requireUser(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const row = db.select().from(photos).where(and(eq(photos.id, id), eq(photos.userId, user.id))).get();
    if (!row || !existsSync(row.path)) throw notFound();
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.type(row.mime).send(createReadStream(row.path));
  });

  // ---------- Administration ----------

  const publicSettings = (): AiSettings => {
    const { apiKey, ...rest } = readAiSettings(db, ai.secrets);
    void apiKey;
    return rest;
  };

  app.get('/admin/ai', async (request) => {
    requireAdmin(request);
    return publicSettings();
  });

  app.patch('/admin/ai', async (request) => {
    requireAdmin(request);
    writeAiSettings(db, ai.secrets, aiSettingsBody.parse(request.body));
    return publicSettings();
  });

  app.post('/admin/ai/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    requireAdmin(request);
    return { result: await testApiKey(ai) };
  });

  app.get('/admin/ai/usage', async (request) => {
    requireAdmin(request);
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(request.query);
    const target = month ?? new Date().toISOString().slice(0, 7);
    const rows = db
      .select({
        userId: aiUsage.userId,
        name: users.name,
        model: aiUsage.model,
        requests: aiUsage.requests,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        costUsd: aiUsage.costUsd
      })
      .from(aiUsage)
      .innerJoin(users, eq(users.id, aiUsage.userId))
      .where(eq(aiUsage.month, target))
      .orderBy(asc(users.name))
      .all();
    return { month: target, rows };
  });
}

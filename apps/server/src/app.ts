// SPDX-License-Identifier: AGPL-3.0-or-later
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import type { Db } from './db/index.ts';
import { loadUser } from './auth.ts';
import { errorHandler } from './http.ts';
import { authRoutes } from './routes/auth.ts';
import { adminRoutes } from './routes/admin.ts';
import { diaryRoutes } from './routes/diary.ts';
import { pushRoutes } from './routes/push.ts';
import { oauthApiRoutes, oauthRoutes } from './oauth.ts';
import { mcpRoutes } from './mcp.ts';
import type { PushSender } from './push.ts';

export interface AppContext {
  db: Db;
  config: Config;
  push: PushSender;
}

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: ctx.config.logLevel },
    trustProxy: true,
    bodyLimit: 1024 * 1024
  });

  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  // OAuth token requests are form-encoded.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  app.decorateRequest('user', null);
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    return payload;
  });

  await app.register(
    async (api) => {
      api.addHook('onRequest', async (request, reply) => {
        request.user = loadUser(ctx.db, request, reply);
        reply.header('Cache-Control', 'no-store');
      });
      await api.register(async (scope) => authRoutes(scope, ctx));
      await api.register(async (scope) => diaryRoutes(scope, ctx));
      await api.register(async (scope) => adminRoutes(scope, ctx), { prefix: '/admin' });
      await api.register(async (scope) => pushRoutes(scope, ctx), { prefix: '/push' });
      await api.register(async (scope) => oauthApiRoutes(scope, ctx));
    },
    { prefix: '/api' }
  );

  app.get('/healthz', async () => ({ ok: true }));
  await app.register(async (scope) => oauthRoutes(scope, ctx));
  await app.register(async (scope) => mcpRoutes(scope, ctx));

  const hasWeb = existsSync(join(ctx.config.publicDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: ctx.config.publicDir,
      wildcard: false,
      setHeaders(res, path) {
        if (/[\\/]_app[\\/]immutable[\\/]/.test(path)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    });
  }

  // Single-page app: unknown non-API GET requests get index.html; the client router takes over.
  app.setNotFoundHandler((request, reply) => {
    if (hasWeb && request.method === 'GET' && !request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ error: 'notFound' });
  });

  return app;
}

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
import { errorHandler, forbidden } from './http.ts';
import { authRoutes } from './routes/auth.ts';
import { adminRoutes } from './routes/admin.ts';
import { diaryRoutes } from './routes/diary.ts';
import { pushRoutes } from './routes/push.ts';
import { oauthApiRoutes, oauthRoutes } from './oauth.ts';
import { mcpRoutes } from './mcp.ts';
import { aiRoutes } from './routes/ai.ts';
import { favoriteRoutes } from './routes/favorites.ts';
import { weightRoutes } from './routes/weight.ts';
import { insightRoutes } from './routes/insights.ts';
import { productRoutes } from './routes/products.ts';
import type { BarcodeLookup } from './foods.ts';
import { PERMISSIONS_POLICY, contentSecurityPolicy } from './security.ts';
import type { AiContext } from './ai.ts';
import type { PushSender } from './push.ts';

export interface AppContext {
  db: Db;
  config: Config;
  push: PushSender;
  ai: AiContext & { kick(): void };
  foods: { lookup: BarcodeLookup };
}

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: ctx.config.logLevel },
    trustProxy: ctx.config.trustProxy,
    bodyLimit: 1024 * 1024
  });

  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.decorateRequest('user', null);
  const csp = contentSecurityPolicy(ctx.config.publicDir);
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', PERMISSIONS_POLICY);
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (request.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=31536000');
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.startsWith('text/html')) reply.header('Content-Security-Policy', csp);
    return payload;
  });

  await app.register(
    async (api) => {
      api.addHook('onRequest', async (request, reply) => {
        // Browsers say where a request comes from. A page on another site, or on a sibling subdomain
        // (which SameSite=Lax cookies do not stop), may read nothing here and must not change anything.
        const site = request.headers['sec-fetch-site'];
        if (!['GET', 'HEAD'].includes(request.method) && (site === 'cross-site' || site === 'same-site')) throw forbidden('crossSite');
        request.user = loadUser(ctx.db, request, reply);
        reply.header('Cache-Control', 'no-store');
      });
      await api.register(async (scope) => authRoutes(scope, ctx));
      await api.register(async (scope) => diaryRoutes(scope, ctx));
      await api.register(async (scope) => adminRoutes(scope, ctx), { prefix: '/admin' });
      await api.register(async (scope) => pushRoutes(scope, ctx), { prefix: '/push' });
      await api.register(async (scope) => oauthApiRoutes(scope, ctx));
      await api.register(async (scope) => aiRoutes(scope, ctx));
      await api.register(async (scope) => favoriteRoutes(scope, ctx));
      await api.register(async (scope) => weightRoutes(scope, ctx));
      await api.register(async (scope) => insightRoutes(scope, ctx));
      await api.register(async (scope) => productRoutes(scope, ctx));
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

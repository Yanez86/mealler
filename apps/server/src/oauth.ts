// SPDX-License-Identifier: AGPL-3.0-or-later
// OAuth 2.1 authorization server used by the claude.ai connector:
// discovery (RFC 8414 + RFC 9728), dynamic client registration (RFC 7591),
// authorization code with mandatory PKCE S256, rotating refresh tokens, revocation (RFC 7009).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AppContext } from './app.ts';
import { randomToken, requireUser, sha256, type UserRow } from './auth.ts';
import type { Config } from './config.ts';
import type { Db } from './db/index.ts';
import { oauthClients, oauthCodes, oauthTokens, users } from './db/schema.ts';
import { HttpError, forbidden, notFound } from './http.ts';
import { getSetting } from './services.ts';

export const SCOPE = 'mealler';
const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** access_expires_at of a token pair whose refresh token was exchanged for a new pair. */
const ROTATED = 0;

export const isMcpEnabled = (db: Db) => getSetting(db, 'mcp_enabled') === 'true';

export function publicBase(config: Config, request: FastifyRequest): string {
  return config.baseUrl ?? `${request.protocol}://${request.host}`;
}

class OAuthError extends Error {
  status: number;
  error: string;
  constructor(status: number, error: string, description?: string) {
    super(description ?? error);
    this.status = status;
    this.error = error;
  }
}

function sendOAuthError(reply: FastifyReply, e: unknown) {
  if (e instanceof OAuthError) {
    return reply.status(e.status).header('Cache-Control', 'no-store').send({ error: e.error, error_description: e.message });
  }
  if (e instanceof z.ZodError) {
    return reply.status(400).send({ error: 'invalid_request', error_description: 'Invalid parameters' });
  }
  throw e;
}

const validRedirect = (uri: string) => {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
  } catch {
    return false;
  }
};

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Parameters of an authorization request, shared by GET /oauth/authorize and the consent page API. */
export const authorizeParams = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1).max(200),
  redirect_uri: z.string().max(2000),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  state: z.string().max(2000).optional(),
  scope: z.string().max(200).optional(),
  resource: z.string().max(2000).optional()
});
export type AuthorizeParams = z.infer<typeof authorizeParams>;

export function checkClient(db: Db, params: AuthorizeParams) {
  const client = db.select().from(oauthClients).where(eq(oauthClients.clientId, params.client_id)).get();
  if (!client) throw new OAuthError(400, 'invalid_client', 'Unknown client');
  const uris = JSON.parse(client.redirectUris) as string[];
  if (!uris.includes(params.redirect_uri)) throw new OAuthError(400, 'invalid_request', 'redirect_uri not registered');
  return client;
}

function redirectWith(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

export function issueCode(db: Db, user: UserRow, params: AuthorizeParams): string {
  const code = randomToken(32);
  db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, Date.now())).run();
  db.insert(oauthCodes)
    .values({
      codeHash: sha256(code),
      clientId: params.client_id,
      userId: user.id,
      redirectUri: params.redirect_uri,
      codeChallenge: params.code_challenge,
      scope: SCOPE,
      expiresAt: Date.now() + CODE_TTL_MS
    })
    .run();
  return code;
}

function issueTokens(db: Db, clientId: string, userId: number) {
  const accessToken = `mla_${randomToken(32)}`;
  const refreshToken = `mlr_${randomToken(32)}`;
  const now = Date.now();
  db.delete(oauthTokens).where(lt(oauthTokens.refreshExpiresAt, now)).run();
  db.insert(oauthTokens)
    .values({
      clientId,
      userId,
      accessHash: sha256(accessToken),
      refreshHash: sha256(refreshToken),
      scope: SCOPE,
      accessExpiresAt: now + ACCESS_TTL_MS,
      refreshExpiresAt: now + REFRESH_TTL_MS
    })
    .run();
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_MS / 1000,
    refresh_token: refreshToken,
    scope: SCOPE
  };
}

/** Resolves a Bearer access token to its active user, or null. */
export function userFromBearer(db: Db, request: FastifyRequest): UserRow | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  const row = db
    .select({ user: users, tokenId: oauthTokens.id })
    .from(oauthTokens)
    .innerJoin(users, eq(users.id, oauthTokens.userId))
    .where(and(eq(oauthTokens.accessHash, sha256(token)), gt(oauthTokens.accessExpiresAt, Date.now())))
    .get();
  if (!row || !row.user.active) return null;
  db.update(oauthTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(oauthTokens.id, row.tokenId)).run();
  return row.user;
}

function authenticateClient(db: Db, request: FastifyRequest, body: Record<string, string>) {
  let clientId = body.client_id;
  let secret = body.client_secret;
  const basic = request.headers.authorization;
  if (basic?.startsWith('Basic ')) {
    const [id, pass] = Buffer.from(basic.slice(6), 'base64').toString().split(':');
    clientId = decodeURIComponent(id ?? '');
    secret = decodeURIComponent(pass ?? '');
  }
  if (!clientId) throw new OAuthError(401, 'invalid_client', 'Missing client_id');
  const client = db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
  if (!client) throw new OAuthError(401, 'invalid_client', 'Unknown client');
  if (client.clientSecretHash && (!secret || !safeEqual(sha256(secret), client.clientSecretHash))) {
    throw new OAuthError(401, 'invalid_client', 'Bad client credentials');
  }
  return client;
}

/** Public OAuth endpoints, registered at the root of the server. */
export async function oauthRoutes(app: FastifyInstance, { db, config }: AppContext) {
  const ensureEnabled = () => {
    if (!isMcpEnabled(db)) throw notFound();
  };

  // Token and revocation requests are form-encoded. Only these routes accept forms: the JSON API must not,
  // or a plain HTML form on another page could post to it.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  const protectedResource = async (request: FastifyRequest) => {
    ensureEnabled();
    const base = publicBase(config, request);
    return {
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
      scopes_supported: [SCOPE],
      resource_name: 'Mealler'
    };
  };
  app.get('/.well-known/oauth-protected-resource', protectedResource);
  app.get('/.well-known/oauth-protected-resource/mcp', protectedResource);

  const serverMetadata = async (request: FastifyRequest) => {
    ensureEnabled();
    const base = publicBase(config, request);
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      revocation_endpoint: `${base}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: [SCOPE]
    };
  };
  app.get('/.well-known/oauth-authorization-server', serverMetadata);
  app.get('/.well-known/openid-configuration', serverMetadata);

  app.post('/oauth/register', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    try {
      ensureEnabled();
      const body = z
        .object({
          client_name: z.string().max(200).optional(),
          redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
          token_endpoint_auth_method: z.enum(['none', 'client_secret_post', 'client_secret_basic']).default('none'),
          grant_types: z.array(z.string()).optional(),
          response_types: z.array(z.string()).optional(),
          scope: z.string().optional()
        })
        .passthrough()
        .parse(request.body);
      if (!body.redirect_uris.every(validRedirect)) {
        throw new OAuthError(400, 'invalid_redirect_uri', 'Redirect URIs must be https (or localhost)');
      }
      const clientId = `mlc_${randomToken(16)}`;
      const secret = body.token_endpoint_auth_method === 'none' ? null : randomToken(32);
      const name = body.client_name?.trim() || 'MCP client';
      db.insert(oauthClients)
        .values({
          clientId,
          clientSecretHash: secret ? sha256(secret) : null,
          name,
          redirectUris: JSON.stringify(body.redirect_uris)
        })
        .run();
      return reply.status(201).send({
        client_id: clientId,
        ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: name,
        redirect_uris: body.redirect_uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: body.token_endpoint_auth_method,
        scope: SCOPE
      });
    } catch (e) {
      return sendOAuthError(reply, e);
    }
  });

  // The browser lands here; the consent screen is part of the web app.
  app.get('/oauth/authorize', async (request, reply) => {
    ensureEnabled();
    const query = request.query as Record<string, string>;
    const parsed = authorizeParams.safeParse(query);
    if (!parsed.success) {
      return reply.status(400).type('text/plain').send('Invalid authorization request (PKCE S256 is required).');
    }
    try {
      checkClient(db, parsed.data);
    } catch (e) {
      // Never redirect to an unverified URI.
      return reply.status(400).type('text/plain').send(e instanceof Error ? e.message : 'Invalid request');
    }
    return reply.redirect(`/consent?${new URLSearchParams(query).toString()}`);
  });

  app.post('/oauth/token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      ensureEnabled();
      const body = (request.body ?? {}) as Record<string, string>;
      const client = authenticateClient(db, request, body);

      if (body.grant_type === 'authorization_code') {
        const { code, redirect_uri, code_verifier } = body;
        if (!code || !redirect_uri || !code_verifier) throw new OAuthError(400, 'invalid_request', 'Missing parameters');
        const row = db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, sha256(code))).get();
        // Codes are single use: delete before checking anything else.
        if (row) db.delete(oauthCodes).where(eq(oauthCodes.codeHash, row.codeHash)).run();
        if (!row || row.expiresAt < Date.now() || row.clientId !== client.clientId || row.redirectUri !== redirect_uri) {
          throw new OAuthError(400, 'invalid_grant', 'Invalid or expired code');
        }
        if (!safeEqual(s256(code_verifier), row.codeChallenge)) throw new OAuthError(400, 'invalid_grant', 'PKCE check failed');
        return issueTokens(db, client.clientId, row.userId);
      }

      if (body.grant_type === 'refresh_token') {
        if (!body.refresh_token) throw new OAuthError(400, 'invalid_request', 'Missing refresh_token');
        const row = db
          .select()
          .from(oauthTokens)
          .where(eq(oauthTokens.refreshHash, sha256(body.refresh_token)))
          .get();
        if (!row || row.clientId !== client.clientId || row.refreshExpiresAt < Date.now()) {
          throw new OAuthError(400, 'invalid_grant', 'Invalid refresh token');
        }
        if (row.accessExpiresAt === ROTATED) {
          // A refresh token already exchanged is being used again: it was copied, and there is no telling
          // which side is the thief. This app's access for this user ends; they connect it again.
          db.delete(oauthTokens).where(and(eq(oauthTokens.clientId, row.clientId), eq(oauthTokens.userId, row.userId))).run();
          throw new OAuthError(400, 'invalid_grant', 'Refresh token reused');
        }
        const user = db.select().from(users).where(eq(users.id, row.userId)).get();
        if (!user?.active) throw new OAuthError(400, 'invalid_grant', 'User disabled');
        // Rotation: the old pair stops working as soon as a new one is issued. Its row stays, marked,
        // until the refresh token would have expired, so a second use can be told from an unknown token.
        db.update(oauthTokens).set({ accessHash: `rotated:${row.id}`, accessExpiresAt: ROTATED }).where(eq(oauthTokens.id, row.id)).run();
        return issueTokens(db, client.clientId, row.userId);
      }

      throw new OAuthError(400, 'unsupported_grant_type');
    } catch (e) {
      return sendOAuthError(reply, e);
    }
  });

  app.post('/oauth/revoke', async (request, reply) => {
    try {
      ensureEnabled();
      const body = (request.body ?? {}) as Record<string, string>;
      const client = authenticateClient(db, request, body);
      if (body.token) {
        const hash = sha256(body.token);
        db.delete(oauthTokens)
          .where(
            and(
              eq(oauthTokens.clientId, client.clientId),
              sql`(${oauthTokens.accessHash} = ${hash} OR ${oauthTokens.refreshHash} = ${hash})`
            )
          )
          .run();
      }
      return reply.status(200).send({});
    } catch (e) {
      return sendOAuthError(reply, e);
    }
  });
}

/** Session-authenticated API used by the web app (consent screen, connected apps). */
export async function oauthApiRoutes(app: FastifyInstance, { db, config }: AppContext) {
  app.get('/connector', async (request) => {
    requireUser(request);
    return { enabled: isMcpEnabled(db), url: `${publicBase(config, request)}/mcp` };
  });

  app.get('/oauth/request', async (request) => {
    requireUser(request);
    if (!isMcpEnabled(db)) throw forbidden('connectorDisabled');
    const params = authorizeParams.safeParse(request.query);
    if (!params.success) throw new HttpError(400, 'invalidOAuthRequest');
    try {
      const client = checkClient(db, params.data);
      return { clientName: client.name, redirectHost: new URL(params.data.redirect_uri).host };
    } catch {
      throw new HttpError(400, 'invalidOAuthRequest');
    }
  });

  app.post('/oauth/decision', async (request) => {
    const user = requireUser(request);
    if (!isMcpEnabled(db)) throw forbidden('connectorDisabled');
    const body = z.object({ approve: z.boolean(), params: authorizeParams }).safeParse(request.body);
    if (!body.success) throw new HttpError(400, 'invalidOAuthRequest');
    const { params, approve } = body.data;
    try {
      checkClient(db, params);
    } catch {
      throw new HttpError(400, 'invalidOAuthRequest');
    }
    if (!approve) {
      return { redirect: redirectWith(params.redirect_uri, { error: 'access_denied', state: params.state }) };
    }
    const code = issueCode(db, user, params);
    return { redirect: redirectWith(params.redirect_uri, { code, state: params.state }) };
  });

  app.get('/oauth/connections', async (request) => {
    const user = requireUser(request);
    const rows = db
      .select({
        clientId: oauthTokens.clientId,
        name: oauthClients.name,
        createdAt: sql<string>`min(${oauthTokens.createdAt})`,
        lastUsedAt: sql<string | null>`max(${oauthTokens.lastUsedAt})`
      })
      .from(oauthTokens)
      .innerJoin(oauthClients, eq(oauthClients.clientId, oauthTokens.clientId))
      .where(and(eq(oauthTokens.userId, user.id), gt(oauthTokens.refreshExpiresAt, Date.now())))
      .groupBy(oauthTokens.clientId, oauthClients.name)
      .orderBy(desc(sql`max(${oauthTokens.createdAt})`))
      .all();
    return rows;
  });

  app.delete('/oauth/connections/:clientId', async (request) => {
    const user = requireUser(request);
    const { clientId } = z.object({ clientId: z.string().max(200) }).parse(request.params);
    db.delete(oauthTokens)
      .where(and(eq(oauthTokens.userId, user.id), eq(oauthTokens.clientId, clientId)))
      .run();
    return { ok: true };
  });
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from './db/index.ts';
import { oauthTokens, passwordResets, sessions, users } from './db/schema.ts';
import { forbidden, unauthorized } from './http.ts';

export const SESSION_COOKIE = 'mealler_session';
const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type UserRow = typeof users.$inferSelect;

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function createSession(db: Db, request: FastifyRequest, reply: FastifyReply, userId: number) {
  const token = randomToken();
  const expiresAt = Date.now() + SESSION_DAYS * DAY_MS;
  db.insert(sessions)
    .values({ id: sha256(token), userId, expiresAt, userAgent: request.headers['user-agent']?.slice(0, 300) ?? null })
    .run();
  setSessionCookie(request, reply, token, expiresAt);
}

function setSessionCookie(request: FastifyRequest, reply: FastifyReply, token: string, expiresAt: number) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Secure only when the request really came over HTTPS (directly or via a trusted proxy),
    // so the app also works on a plain-HTTP LAN address.
    secure: request.protocol === 'https',
    expires: new Date(expiresAt)
  });
}

export function destroySession(db: Db, request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE];
  if (token) db.delete(sessions).where(eq(sessions.id, sha256(token))).run();
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolves the logged-in user from the session cookie; renews sessions that are past half-life. */
export function loadUser(db: Db, request: FastifyRequest, reply: FastifyReply): UserRow | null {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const now = Date.now();
  const row = db
    .select({ user: users, expiresAt: sessions.expiresAt, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, now)))
    .get();
  if (!row || !row.user.active) return null;
  if (row.expiresAt - now < (SESSION_DAYS / 2) * DAY_MS) {
    const expiresAt = now + SESSION_DAYS * DAY_MS;
    db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.sessionId)).run();
    setSessionCookie(request, reply, token, expiresAt);
  }
  return row.user;
}

/** A one-time token to set a new password within 24 hours; it replaces any earlier one for the same user. */
export function createPasswordReset(db: Db, userId: number): string {
  const token = randomToken();
  db.delete(passwordResets).where(eq(passwordResets.userId, userId)).run();
  db.insert(passwordResets).values({ tokenHash: sha256(token), userId, expiresAt: Date.now() + DAY_MS }).run();
  return token;
}

/** Sets the password chosen with a reset token and signs the user out everywhere. Returns the user, or null. */
export function usePasswordReset(db: Db, token: string, passwordHash: string): UserRow | null {
  const reset = db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, sha256(token)), gt(passwordResets.expiresAt, Date.now())))
    .get();
  if (!reset) return null;
  db.delete(passwordResets).where(eq(passwordResets.userId, reset.userId)).run();
  db.delete(sessions).where(eq(sessions.userId, reset.userId)).run();
  db.delete(oauthTokens).where(eq(oauthTokens.userId, reset.userId)).run();
  return db.update(users).set({ passwordHash }).where(eq(users.id, reset.userId)).returning().get() ?? null;
}

export function requireUser(request: FastifyRequest): UserRow {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function requireAdmin(request: FastifyRequest): UserRow {
  const user = requireUser(request);
  if (user.role !== 'admin') throw forbidden();
  return user;
}

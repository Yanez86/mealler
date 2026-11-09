// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (code = 'validation') => new HttpError(400, code);
export const unauthorized = () => new HttpError(401, 'unauthorized');
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = () => new HttpError(404, 'notFound');
export const conflict = (code: string) => new HttpError(409, code);

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  return schema.parse(value);
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'validation', issues: error.issues.map((i) => ({ path: i.path, code: i.code })) });
  }
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ error: error.code });
  }
  const statusCode = (error as FastifyError).statusCode;
  if (statusCode === 429) return reply.status(429).send({ error: 'tooMany' });
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return reply.status(statusCode).send({ error: 'validation' });
  }
  request.log.error(error);
  return reply.status(500).send({ error: 'internal' });
}

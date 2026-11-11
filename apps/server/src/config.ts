// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolve } from 'node:path';

declare const __APP_VERSION__: string | undefined;

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  publicDir: string;
  migrationsDir: string;
  baseUrl: string | null;
  sourceUrl: string;
  version: string;
  logLevel: string;
  updateCheck: boolean;
  trustProxy: false | string[];
}

/**
 * MEALLER_TRUST_PROXY: the addresses or networks of the reverse proxies in front of Mealler, separated by
 * commas ("none" to trust nobody). X-Forwarded-* headers count only when they come from one of them:
 * the client address used for rate limits and the HTTPS flag are never what an outsider wrote.
 * Default: private and local addresses, where a proxy on the same machine or Docker network lives.
 */
function trustProxy(value: string | undefined): Config['trustProxy'] {
  const v = value?.trim() || 'loopback, linklocal, uniquelocal';
  if (['none', 'false', '0'].includes(v.toLowerCase())) return false;
  return v.split(',').map((part) => part.trim()).filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = env.MEALLER_BASE_URL?.trim().replace(/\/+$/, '') || null;
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir: resolve(env.MEALLER_DATA_DIR ?? './data'),
    publicDir: resolve(env.MEALLER_PUBLIC_DIR ?? './public'),
    migrationsDir: resolve(env.MEALLER_MIGRATIONS_DIR ?? './migrations'),
    baseUrl,
    sourceUrl: env.MEALLER_SOURCE_URL ?? 'https://github.com/Yanez86/mealler',
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    logLevel: env.LOG_LEVEL ?? 'info',
    updateCheck: env.MEALLER_UPDATE_CHECK !== 'false',
    trustProxy: trustProxy(env.MEALLER_TRUST_PROXY)
  };
}

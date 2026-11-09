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
    logLevel: env.LOG_LEVEL ?? 'info'
  };
}

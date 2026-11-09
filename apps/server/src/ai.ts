// SPDX-License-Identifier: AGPL-3.0-or-later
// In-app nutritional estimates with the Anthropic Messages API (text and photos).
// The model answers through a forced tool call, so the output is always structured.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  NUTRIENTS,
  isLocale,
  sumValues,
  todayIn,
  type AiSettings,
  type AiStatus,
  type Estimate,
  type EstimateItem
} from '@mealler/shared';
import type { UserRow } from './auth.ts';
import type { Db } from './db/index.ts';
import { aiUsage, aiUsageDaily, entries, photos } from './db/schema.ts';
import { HttpError } from './http.ts';
import type { SecretBox } from './secrets.ts';
import { getSetting, setSetting } from './services.ts';

/** USD per million tokens (input, output), standard prices for prompts under 100k tokens. */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 }
};
export const AI_MODELS = Object.keys(PRICES);
const DEFAULT_TEXT_MODEL = 'claude-haiku-5-5';
const DEFAULT_PHOTO_MODEL = 'claude-sonnet-5-5';
const DEFAULT_DAILY_REQUESTS = 40;
const DEFAULT_PER_MINUTE = 6;
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export interface AnthropicResponse {
  status: number;
  body: {
    content?: { type: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { type?: string; message?: string };
  };
}

/** Sends one Messages API request. Injectable so tests never call the real API. */
export type AnthropicCall = (apiKey: string, body: Record<string, unknown>) => Promise<AnthropicResponse>;

export const anthropicFetch: AnthropicCall = async (apiKey, body) => {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000)
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as AnthropicResponse['body'] };
};

export interface AiContext {
  db: Db;
  secrets: SecretBox;
  call: AnthropicCall;
  dataDir: string;
}

// ---------- Settings ----------

export function readAiSettings(db: Db, secrets: SecretBox): AiSettings & { apiKey: string | null } {
  const sealed = getSetting(db, 'ai_api_key');
  let apiKey: string | null = null;
  if (sealed) {
    try {
      apiKey = secrets.decrypt(sealed);
    } catch {
      apiKey = null;
    }
  }
  const cap = getSetting(db, 'ai_monthly_cap_usd');
  // Limits: an unset setting uses the default, an empty one means "no limit".
  const limit = (key: string, fallback: number | null) => {
    const v = getSetting(db, key);
    if (v === null) return fallback;
    return v === '' ? null : Number(v);
  };
  const pick = (key: string, fallback: string) => {
    const v = getSetting(db, key);
    return v && AI_MODELS.includes(v) ? v : fallback;
  };
  return {
    enabled: getSetting(db, 'ai_enabled') === 'true',
    hasKey: !!apiKey,
    keyHint: apiKey ? `…${apiKey.slice(-4)}` : null,
    apiKey,
    modelText: pick('ai_model_text', DEFAULT_TEXT_MODEL),
    modelPhoto: pick('ai_model_photo', DEFAULT_PHOTO_MODEL),
    monthlyCapUsd: cap ? Number(cap) : null,
    dailyRequests: limit('ai_daily_requests', DEFAULT_DAILY_REQUESTS),
    dailyTokens: limit('ai_daily_tokens', null),
    perMinute: limit('ai_per_minute', DEFAULT_PER_MINUTE),
    instanceMonthlyUsd: limit('ai_instance_monthly_usd', null),
    keepPhotos: getSetting(db, 'ai_keep_photos') === 'true',
    models: AI_MODELS
  };
}

export const aiSettingsBody = z
  .object({
    enabled: z.boolean(),
    apiKey: z.string().trim().max(300).nullable(),
    modelText: z.enum(AI_MODELS as [string, ...string[]]),
    modelPhoto: z.enum(AI_MODELS as [string, ...string[]]),
    monthlyCapUsd: z.number().min(0).max(10000).nullable(),
    dailyRequests: z.number().int().min(0).max(10000).nullable(),
    dailyTokens: z.number().int().min(0).max(100_000_000).nullable(),
    perMinute: z.number().int().min(1).max(600).nullable(),
    instanceMonthlyUsd: z.number().min(0).max(100000).nullable(),
    keepPhotos: z.boolean()
  })
  .partial();

export function writeAiSettings(db: Db, secrets: SecretBox, body: z.infer<typeof aiSettingsBody>) {
  if (body.enabled !== undefined) setSetting(db, 'ai_enabled', String(body.enabled));
  if (body.apiKey !== undefined) setSetting(db, 'ai_api_key', body.apiKey ? secrets.encrypt(body.apiKey) : '');
  if (body.modelText) setSetting(db, 'ai_model_text', body.modelText);
  if (body.modelPhoto) setSetting(db, 'ai_model_photo', body.modelPhoto);
  if (body.monthlyCapUsd !== undefined) setSetting(db, 'ai_monthly_cap_usd', body.monthlyCapUsd == null ? '' : String(body.monthlyCapUsd));
  if (body.keepPhotos !== undefined) setSetting(db, 'ai_keep_photos', String(body.keepPhotos));
  const limits = [
    ['dailyRequests', 'ai_daily_requests'],
    ['dailyTokens', 'ai_daily_tokens'],
    ['perMinute', 'ai_per_minute'],
    ['instanceMonthlyUsd', 'ai_instance_monthly_usd']
  ] as const;
  for (const [field, key] of limits) {
    const value = body[field];
    if (value !== undefined) setSetting(db, key, value == null ? '' : String(value));
  }
}

// ---------- Usage ----------

const monthOf = (user: UserRow) => todayIn(user.timezone).slice(0, 7);

function today(db: Db, user: UserRow): { requests: number; tokens: number } {
  const row = db
    .select()
    .from(aiUsageDaily)
    .where(and(eq(aiUsageDaily.userId, user.id), eq(aiUsageDaily.day, todayIn(user.timezone))))
    .get();
  return { requests: row?.requests ?? 0, tokens: row?.tokens ?? 0 };
}

function countDaily(db: Db, user: UserRow, requests: number, tokens: number) {
  db.insert(aiUsageDaily)
    .values({ userId: user.id, day: todayIn(user.timezone), requests, tokens })
    .onConflictDoUpdate({
      target: [aiUsageDaily.userId, aiUsageDaily.day],
      set: { requests: sql`${aiUsageDaily.requests} + ${requests}`, tokens: sql`${aiUsageDaily.tokens} + ${tokens}` }
    })
    .run();
}

function instanceSpentThisMonth(db: Db): number {
  const month = new Date().toISOString().slice(0, 7);
  const row = db
    .select({ cost: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(eq(aiUsage.month, month))
    .get();
  return Number(row?.cost ?? 0);
}

// Short-term burst protection, per user, in memory.
const recent = new Map<string, number[]>();
function tooFast(user: UserRow, perMinute: number | null, now = Date.now()): boolean {
  if (!perMinute) return false;
  const key = `${user.id}:${user.createdAt}`;
  const list = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
  const blocked = list.length >= perMinute;
  if (!blocked) list.push(now);
  recent.set(key, list);
  return blocked;
}

/** Throws when any limit is reached; otherwise counts the attempt before the API call. */
function checkLimits(db: Db, user: UserRow, s: ReturnType<typeof readAiSettings>) {
  if (s.monthlyCapUsd != null && spentThisMonth(db, user) >= s.monthlyCapUsd) throw new HttpError(429, 'aiCapReached');
  if (s.instanceMonthlyUsd != null && instanceSpentThisMonth(db) >= s.instanceMonthlyUsd) {
    throw new HttpError(429, 'aiInstanceCap');
  }
  const day = today(db, user);
  if (s.dailyRequests != null && day.requests >= s.dailyRequests) throw new HttpError(429, 'aiDailyLimit');
  if (s.dailyTokens != null && day.tokens >= s.dailyTokens) throw new HttpError(429, 'aiDailyLimit');
  if (tooFast(user, s.perMinute)) throw new HttpError(429, 'aiTooFast');
  countDaily(db, user, 1, 0);
}

export function spentThisMonth(db: Db, user: UserRow): number {
  const row = db
    .select({ cost: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, user.id), eq(aiUsage.month, monthOf(user))))
    .get();
  return Number(row?.cost ?? 0);
}

export function aiStatus(db: Db, secrets: SecretBox, user: UserRow): AiStatus {
  const s = readAiSettings(db, secrets);
  const spent = spentThisMonth(db, user);
  const day = today(db, user);
  const capReached =
    (s.monthlyCapUsd != null && spent >= s.monthlyCapUsd) ||
    (s.instanceMonthlyUsd != null && instanceSpentThisMonth(db) >= s.instanceMonthlyUsd);
  const limitReached =
    (s.dailyRequests != null && day.requests >= s.dailyRequests) || (s.dailyTokens != null && day.tokens >= s.dailyTokens);
  return {
    enabled: s.enabled && s.hasKey,
    capUsd: s.monthlyCapUsd,
    spentUsd: Math.round(spent * 10000) / 10000,
    capReached,
    requestsToday: day.requests,
    dailyRequests: s.dailyRequests,
    limitReached
  };
}

function recordUsage(db: Db, user: UserRow, model: string, input: number, output: number): number {
  const price = PRICES[model] ?? { input: 0, output: 0 };
  const cost = (input * price.input + output * price.output) / 1_000_000;
  db.insert(aiUsage)
    .values({ userId: user.id, month: monthOf(user), model, requests: 1, inputTokens: input, outputTokens: output, costUsd: cost })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.month, aiUsage.model],
      set: {
        requests: sql`${aiUsage.requests} + 1`,
        inputTokens: sql`${aiUsage.inputTokens} + ${input}`,
        outputTokens: sql`${aiUsage.outputTokens} + ${output}`,
        costUsd: sql`${aiUsage.costUsd} + ${cost}`
      }
    })
    .run();
  return cost;
}

// ---------- Estimate ----------

const n = z.number().min(0).max(100000);
const toolOutput = z.object({
  description: z.string().max(1000),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        quantity: z.string().max(100).optional(),
        kcal: n,
        protein: n,
        carbs: n,
        fat: n,
        fiber: n.nullable().optional()
      })
    )
    .min(1)
    .max(50),
  confidence: z.enum(['low', 'medium', 'high']),
  notes: z.string().max(1000).nullable().optional()
});

const TOOL = {
  name: 'record_estimate',
  description: 'Record the nutritional estimate of the meal.',
  input_schema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: "Short, clean description of the meal in the user's language" },
      items: {
        type: 'array',
        description: 'One entry per food',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'string', description: 'Estimated amount, e.g. "120 g", "1 cup"' },
            kcal: { type: 'number' },
            protein: { type: 'number', description: 'grams' },
            carbs: { type: 'number', description: 'grams' },
            fat: { type: 'number', description: 'grams' },
            fiber: { type: 'number', description: 'grams' }
          },
          required: ['name', 'quantity', 'kcal', 'protein', 'carbs', 'fat', 'fiber']
        }
      },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      notes: { type: 'string', description: 'Assumptions made, in one or two short sentences' }
    },
    required: ['description', 'items', 'confidence']
  }
};

function systemPrompt(locale: string): string {
  const language = locale === 'en' ? 'English' : 'Italian';
  return [
    'You are a careful nutrition assistant inside a food diary.',
    'Estimate the nutritional values of the meal the user describes and/or shows in a photo.',
    'When quantities are missing, assume typical single-person portions for Italian/European home cooking and state the assumption in notes.',
    'Use per-item values consistent with standard food composition tables; energy should be close to 4 kcal/g protein, 4 kcal/g carbohydrate, 9 kcal/g fat.',
    'If the photo or text does not show food, return one item named "unknown" with zeros and confidence "low".',
    `Write description, item names, quantities and notes in ${language}.`,
    'Always answer by calling the record_estimate tool.'
  ].join(' ');
}

export interface EstimateInput {
  text: string;
  quantity?: string | null;
  photo?: { mime: string; data: string } | null;
}

export async function estimateMeal(ctx: AiContext, user: UserRow, input: EstimateInput): Promise<Estimate> {
  const settings = readAiSettings(ctx.db, ctx.secrets);
  if (!settings.enabled || !settings.apiKey) throw new HttpError(403, 'aiDisabled');
  checkLimits(ctx.db, user, settings);
  const model = input.photo ? settings.modelPhoto : settings.modelText;
  const locale = isLocale(user.locale) ? user.locale : 'it';
  const text = [input.text.trim() || (locale === 'it' ? '(vedi foto)' : '(see photo)'), input.quantity ? `Quantity: ${input.quantity}` : '']
    .filter(Boolean)
    .join('\n');
  const content: Record<string, unknown>[] = [];
  if (input.photo) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.photo.mime, data: input.photo.data } });
  }
  content.push({ type: 'text', text });

  let response: AnthropicResponse;
  try {
    response = await ctx.call(settings.apiKey, {
      model,
      max_tokens: 1500,
      system: systemPrompt(locale),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content }]
    });
  } catch {
    throw new HttpError(502, 'aiFailed');
  }
  if (response.status === 401 || response.status === 403) throw new HttpError(502, 'aiKeyInvalid');
  if (response.status === 429 || response.status === 529) throw new HttpError(503, 'aiBusy');
  if (response.status >= 400) throw new HttpError(502, 'aiFailed');

  const usage = response.body.usage ?? {};
  const cost = recordUsage(ctx.db, user, model, usage.input_tokens ?? 0, usage.output_tokens ?? 0);
  countDaily(ctx.db, user, 0, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));

  const call = response.body.content?.find((c) => c.type === 'tool_use' && c.name === TOOL.name);
  const parsed = toolOutput.safeParse(call?.input);
  if (!parsed.success) throw new HttpError(502, 'aiFailed');

  const round = (v: number) => Math.round(v * 10) / 10;
  const items: EstimateItem[] = parsed.data.items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    kcal: round(i.kcal),
    protein: round(i.protein),
    carbs: round(i.carbs),
    fat: round(i.fat),
    fiber: i.fiber == null ? null : round(i.fiber)
  }));
  const totals = sumValues(items.map((i) => ({ ...i, fiber: i.fiber ?? null })));
  return {
    description: parsed.data.description,
    items,
    totals: { kcal: totals.kcal, protein: totals.protein, carbs: totals.carbs, fat: totals.fat, fiber: totals.fiber },
    confidence: parsed.data.confidence,
    notes: parsed.data.notes ?? null,
    model,
    costUsd: Math.round(cost * 1_000_000) / 1_000_000
  };
}

/** Quick validity check of the configured key with a tiny request. */
export async function testApiKey(ctx: AiContext): Promise<'ok' | 'invalid' | 'unreachable'> {
  const settings = readAiSettings(ctx.db, ctx.secrets);
  if (!settings.apiKey) return 'invalid';
  try {
    const res = await ctx.call(settings.apiKey, {
      model: settings.modelText,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'ok' }]
    });
    if (res.status === 401 || res.status === 403) return 'invalid';
    return res.status < 400 || res.status === 429 || res.status === 529 ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

// ---------- Photos ----------

export function savePhoto(ctx: AiContext, user: UserRow, photo: { mime: string; data: string }): string {
  const id = randomUUID();
  const dir = join(ctx.dataDir, 'photos', String(user.id));
  mkdirSync(dir, { recursive: true });
  const ext = photo.mime === 'image/png' ? 'png' : photo.mime === 'image/webp' ? 'webp' : 'jpg';
  const file = join(dir, `${id}.${ext}`);
  const bytes = Buffer.from(photo.data, 'base64');
  writeFileSync(file, bytes, { mode: 0o600 });
  ctx.db.insert(photos).values({ id, userId: user.id, path: file, mime: photo.mime, size: bytes.length }).run();
  return id;
}

export function deletePhoto(db: Db, userId: number, photoId: string) {
  const row = db.select().from(photos).where(and(eq(photos.id, photoId), eq(photos.userId, userId))).get();
  if (!row) return;
  rmSync(row.path, { force: true });
  db.delete(photos).where(eq(photos.id, photoId)).run();
}

// ---------- Background calculation ----------

/** Estimates entries saved with calc_status = 'pending' (text only). Runs one entry at a time. */
export async function processPendingEntries(ctx: AiContext, getUser: (id: number) => UserRow | undefined, limit = 5): Promise<number> {
  const pending = ctx.db.select().from(entries).where(eq(entries.calcStatus, 'pending')).limit(limit).all();
  let done = 0;
  for (const entry of pending) {
    const user = getUser(entry.userId);
    if (!user) continue;
    try {
      const estimate = await estimateMeal(ctx, user, { text: entry.description, quantity: entry.quantity });
      const values = Object.fromEntries(NUTRIENTS.map((k) => [k, estimate.totals[k]]));
      ctx.db
        .update(entries)
        .set({
          ...values,
          detail: JSON.stringify(estimate.items),
          source: 'in_app',
          calcStatus: 'calculated',
          calcError: null,
          updatedAt: new Date().toISOString()
        })
        .where(and(eq(entries.id, entry.id), eq(entries.calcStatus, 'pending')))
        .run();
      done++;
    } catch (error) {
      const code = error instanceof HttpError ? error.code : 'aiFailed';
      // Transient problems are retried on the next run; anything else falls back to manual input.
      if (code === 'aiBusy' || code === 'aiTooFast') continue;
      ctx.db
        .update(entries)
        .set({ calcStatus: 'manual', calcError: code, updatedAt: new Date().toISOString() })
        .where(eq(entries.id, entry.id))
        .run();
    }
  }
  return done;
}

export function startPendingWorker(ctx: AiContext, getUser: (id: number) => UserRow | undefined, log: { error(o: unknown, m?: string): void }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processPendingEntries(ctx, getUser);
    } catch (error) {
      log.error(error, 'pending estimate run failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, 15_000);
  timer.unref();
  return { kick: () => void run(), stop: () => clearInterval(timer) };
}

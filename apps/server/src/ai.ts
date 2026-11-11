// SPDX-License-Identifier: AGPL-3.0-or-later
// In-app nutritional estimates with the Anthropic Messages API (text and photos).
// The model answers through a forced tool call, so the output is always structured.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  NUTRIENTS,
  isLocale,
  sumValues,
  type AiSettings,
  type AiStatus,
  type Estimate,
  type EstimateItem
} from '@mealler/shared';
import type { UserRow } from './auth.ts';
import type { Db } from './db/index.ts';
import { aiSpend, aiUsage, aiUsageDaily, entries, photos } from './db/schema.ts';
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
/** Instance budget until the administrator picks one: the API is never left without a dollar ceiling by default. */
const DEFAULT_INSTANCE_MONTHLY_USD = 10;
/**
 * Output ceiling and effort per kind of request: max_tokens is what one call can cost at most.
 * Thinking is always on with Sonnet 5.5 and Opus 5.5, so the ceilings leave room for it.
 */
const TEXT_CALL = { maxTokens: 4000, effort: 'low' };
const PHOTO_CALL = { maxTokens: 8000, effort: 'medium' };
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export interface AnthropicResponse {
  status: number;
  body: {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string | null;
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
    instanceMonthlyUsd: limit('ai_instance_monthly_usd', DEFAULT_INSTANCE_MONTHLY_USD),
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

// Days and months are UTC for everyone: a counter keyed on the user's own time zone resets when they change it.
const utcDay = () => new Date().toISOString().slice(0, 10);
const utcMonth = () => utcDay().slice(0, 7);

function today(db: Db, user: UserRow): { requests: number; tokens: number } {
  const row = db
    .select()
    .from(aiUsageDaily)
    .where(and(eq(aiUsageDaily.userId, user.id), eq(aiUsageDaily.day, utcDay())))
    .get();
  return { requests: row?.requests ?? 0, tokens: row?.tokens ?? 0 };
}

function countDaily(db: Db, user: UserRow, requests: number, tokens: number) {
  db.insert(aiUsageDaily)
    .values({ userId: user.id, day: utcDay(), requests, tokens })
    .onConflictDoUpdate({
      target: [aiUsageDaily.userId, aiUsageDaily.day],
      set: { requests: sql`${aiUsageDaily.requests} + ${requests}`, tokens: sql`${aiUsageDaily.tokens} + ${tokens}` }
    })
    .run();
}

export function instanceSpentThisMonth(db: Db, month = utcMonth()): number {
  return db.select().from(aiSpend).where(eq(aiSpend.month, month)).get()?.costUsd ?? 0;
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

// Worst case of the calls still in flight. Spend is only known when the answer arrives, so without
// this every request started before the first one ends would pass the same check.
const held = { usd: new Map<number, number>(), tokens: new Map<number, number>(), totalUsd: 0 };

function hold(userId: number, usd: number, tokens: number): () => void {
  held.usd.set(userId, (held.usd.get(userId) ?? 0) + usd);
  held.tokens.set(userId, (held.tokens.get(userId) ?? 0) + tokens);
  held.totalUsd += usd;
  return () => {
    held.usd.set(userId, (held.usd.get(userId) ?? 0) - usd);
    held.tokens.set(userId, (held.tokens.get(userId) ?? 0) - tokens);
    held.totalUsd -= usd;
  };
}

/** Throws when any limit is reached; otherwise counts the attempt before the API call. */
function checkLimits(db: Db, user: UserRow, s: ReturnType<typeof readAiSettings>) {
  if (s.monthlyCapUsd != null && spentThisMonth(db, user) + (held.usd.get(user.id) ?? 0) >= s.monthlyCapUsd) {
    throw new HttpError(429, 'aiCapReached');
  }
  if (s.instanceMonthlyUsd != null && instanceSpentThisMonth(db) + held.totalUsd >= s.instanceMonthlyUsd) {
    throw new HttpError(429, 'aiInstanceCap');
  }
  const day = today(db, user);
  if (s.dailyRequests != null && day.requests >= s.dailyRequests) throw new HttpError(429, 'aiDailyLimit');
  if (s.dailyTokens != null && day.tokens + (held.tokens.get(user.id) ?? 0) >= s.dailyTokens) throw new HttpError(429, 'aiDailyLimit');
  if (tooFast(user, s.perMinute)) throw new HttpError(429, 'aiTooFast');
  countDaily(db, user, 1, 0);
}

export function spentThisMonth(db: Db, user: UserRow): number {
  const row = db
    .select({ cost: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, user.id), eq(aiUsage.month, utcMonth())))
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

function priceOf(model: string) {
  const price = PRICES[model];
  // Never count a model at $0: the dollar limits would silently stop working.
  if (!price) throw new Error(`No price for model ${model}`);
  return price;
}

function recordUsage(db: Db, user: UserRow, model: string, input: number, output: number): number {
  const price = priceOf(model);
  const cost = (input * price.input + output * price.output) / 1_000_000;
  const month = utcMonth();
  db.insert(aiUsage)
    .values({ userId: user.id, month, model, requests: 1, inputTokens: input, outputTokens: output, costUsd: cost })
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
  db.insert(aiSpend)
    .values({ month, costUsd: cost })
    .onConflictDoUpdate({ target: aiSpend.month, set: { costUsd: sql`${aiSpend.costUsd} + ${cost}` } })
    .run();
  countDaily(db, user, 0, input + output);
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

// Structured outputs rather than a forced tool call: Sonnet 5.5 and Opus 5.5 reject a forced tool_choice.
// Every object needs additionalProperties: false.
const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    description: { type: 'string', description: "Short, clean description of the meal in the user's language" },
    items: {
      type: 'array',
      description: 'One entry per food',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          quantity: { type: 'string', description: 'Estimated amount, in g or ml when possible, e.g. "120 g", "200 ml"' },
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
};

// "Tabella valori": the image shows information about the food, not the plate ("Foto" is the plate).
const LABEL_PROMPT = [
  'The image is not a photo of the meal: it is nutrition information about the food the user wrote, such as a nutrition facts table on a package,',
  'a menu, or a screenshot from a meal delivery or recipe app, possibly an ingredient list with quantities.',
  'The values printed in it win over your own estimates: copy them exactly (energy in kcal, not kJ).',
  'If they are per 100 g or per 100 ml, scale them to the quantity the user gives, or else to the portion shown (serving size or net weight).',
  'If only ingredients with their quantities are listed, compute the values of each ingredient and add them up.',
  'Information about one product or one dish is a single item: its name (the one the user wrote, if any), its total quantity (e.g. the sum of the listed ingredient weights) and its total values.'
].join(' ');

function systemPrompt(locale: string, label: boolean): string {
  const language = locale === 'en' ? 'English' : 'Italian';
  return [
    'You are a careful nutrition assistant inside a food diary.',
    'Estimate the nutritional values of the meal the user describes and/or shows in a photo.',
    label ? LABEL_PROMPT : '',
    'A dish name followed by a colon and its ingredients ("carbonara: 70 g pasta, 50 g guanciale, 1 uovo") is one dish:',
    'return one item per listed ingredient with the amounts given (raw weights), estimate typical amounts for ingredients without one,',
    'and use the dish name as description.',
    'When quantities are missing, assume typical single-person portions for Italian/European home cooking and state the assumption in notes.',
    'Use per-item values consistent with standard food composition tables; energy should be close to 4 kcal/g protein, 4 kcal/g carbohydrate, 9 kcal/g fat.',
    'If the photo or text does not show food, return one item named "unknown" with zeros and confidence "low".',
    `Write description, item names, quantities and notes in ${language}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The one path every billed request takes: limits, the call, its accounting.
 * Failures are logged with Anthropic's own reason, since the app only gets a code.
 * 500 rather than 502: Cloudflare replaces an origin's 502 with its own page, hiding the code.
 */
async function billedCall(
  ctx: AiContext,
  user: UserRow,
  kind: typeof TEXT_CALL,
  model: string,
  body: Record<string, unknown>
): Promise<{ response: AnthropicResponse; cost: number }> {
  const settings = readAiSettings(ctx.db, ctx.secrets);
  if (!settings.enabled || !settings.apiKey) throw new HttpError(403, 'aiDisabled');
  // Input is a few thousand tokens at most (one resized photo): the output ceiling is the cost that matters.
  const maxCost = (kind.maxTokens * priceOf(model).output) / 1_000_000;
  checkLimits(ctx.db, user, settings);
  const release = hold(user.id, maxCost, kind.maxTokens);
  try {
    let response: AnthropicResponse;
    try {
      response = await ctx.call(settings.apiKey, { ...body, model, max_tokens: kind.maxTokens });
    } catch (error) {
      console.error(`Anthropic API unreachable: ${error instanceof Error ? error.message : String(error)}`);
      // After a timeout Anthropic was already working on the request and may bill it: count the worst case.
      if (error instanceof Error && error.name === 'TimeoutError') recordUsage(ctx.db, user, model, 0, kind.maxTokens);
      throw new HttpError(500, 'aiFailed');
    }
    if (response.status >= 400) {
      const e = response.body.error;
      console.error(`Anthropic API ${response.status} with ${model}: ${e?.type ?? ''} ${e?.message ?? ''}`.trim());
      if (response.status === 401 || response.status === 403) throw new HttpError(500, 'aiKeyInvalid');
      if (response.status === 429 || response.status === 529) {
        // Nothing was generated: give the daily request back.
        countDaily(ctx.db, user, -1, 0);
        throw new HttpError(503, 'aiBusy');
      }
      throw new HttpError(500, 'aiFailed');
    }
    const usage = response.body.usage ?? {};
    const cost = recordUsage(ctx.db, user, model, usage.input_tokens ?? 0, usage.output_tokens ?? 0);
    // Paid for, but there is no answer to read: trying the same request again would end the same way.
    if (response.body.stop_reason === 'refusal') throw new HttpError(422, 'aiRefused');
    if (response.body.stop_reason === 'max_tokens') throw new HttpError(500, 'aiTruncated');
    return { response, cost };
  } finally {
    release();
  }
}

/** The JSON object of a structured-output answer (its text block), or undefined. */
function jsonAnswer(response: AnthropicResponse): unknown {
  const text = response.body.content?.find((c) => c.type === 'text')?.text;
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

export interface EstimateInput {
  text: string;
  quantity?: string | null;
  photo?: { mime: string; data: string } | null;
  /** The photo is a nutrition table or an ingredient list ("Tabella valori"), not the plate ("Foto"). */
  label?: boolean;
}

export async function estimateMeal(ctx: AiContext, user: UserRow, input: EstimateInput): Promise<Estimate> {
  const settings = readAiSettings(ctx.db, ctx.secrets);
  const model = input.photo ? settings.modelPhoto : settings.modelText;
  const kind = input.photo ? PHOTO_CALL : TEXT_CALL;
  const locale = isLocale(user.locale) ? user.locale : 'it';
  const text = [input.text.trim() || (locale === 'it' ? '(vedi foto)' : '(see photo)'), input.quantity ? `Quantity: ${input.quantity}` : '']
    .filter(Boolean)
    .join('\n');
  const content: Record<string, unknown>[] = [];
  if (input.photo) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.photo.mime, data: input.photo.data } });
  }
  content.push({ type: 'text', text });

  const { response, cost } = await billedCall(ctx, user, kind, model, {
    system: systemPrompt(locale, !!(input.label && input.photo)),
    output_config: { effort: kind.effort, format: { type: 'json_schema', schema: ESTIMATE_SCHEMA } },
    messages: [{ role: 'user', content }]
  });

  const parsed = toolOutput.safeParse(jsonAnswer(response));
  if (!parsed.success) {
    console.error(`Anthropic API: unexpected estimate from ${model}: ${JSON.stringify(response.body).slice(0, 500)}`);
    throw new HttpError(500, 'aiFailed');
  }

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

// ---------- Nutrition label ----------

const LABEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Product name if visible, otherwise empty' },
    brand: { type: 'string', description: 'Brand if visible, otherwise empty' },
    kcal_100g: { type: 'number' },
    protein_100g: { type: 'number' },
    carbs_100g: { type: 'number', description: 'Total carbohydrates' },
    fat_100g: { type: 'number' },
    fiber_100g: { type: 'number', description: 'Use -1 if not on the label' },
    serving_g: { type: 'number', description: 'Grams per serving/portion if stated, else -1' },
    serving_label: { type: 'string', description: 'Serving description if stated, e.g. "1 pacchetto (32 g)"' },
    readable: { type: 'boolean', description: 'false if there is neither a readable nutrition table nor an ingredient list with quantities' }
  },
  required: ['kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g', 'readable']
};

const labelOutput = z.object({
  name: z.string().max(200).optional(),
  brand: z.string().max(200).optional(),
  kcal_100g: n,
  protein_100g: n,
  carbs_100g: n,
  fat_100g: n,
  fiber_100g: z.number().optional(),
  serving_g: z.number().optional(),
  serving_label: z.string().max(100).optional(),
  readable: z.boolean()
});

export interface LabelValues {
  name: string | null;
  brand: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  servingG: number | null;
  servingLabel: string | null;
}

/** Reads a nutrition label photo: values per 100 g (converted from per-serving if needed). */
export async function readNutritionLabel(ctx: AiContext, user: UserRow, photo: { mime: string; data: string }): Promise<LabelValues> {
  const model = readAiSettings(ctx.db, ctx.secrets).modelPhoto;
  const { response } = await billedCall(ctx, user, PHOTO_CALL, model, {
    system:
      'You read nutrition facts tables: photos of food packaging, or screenshots from a meal delivery, recipe or shop app or website. ' +
      'Report values per 100 g (or 100 ml). ' +
      'If the label only gives per-serving values and the serving weight, convert to per 100 g. ' +
      'If there is no nutrition table but an ingredient list with quantities, compute the values of each ingredient from standard food composition tables, ' +
      'add them up, convert to per 100 g of the total, and report the total weight as serving_g. ' +
      'Energy must be in kcal (convert from kJ by dividing by 4.184 if only kJ is shown).',
    output_config: { effort: PHOTO_CALL.effort, format: { type: 'json_schema', schema: LABEL_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: photo.mime, data: photo.data } },
          { type: 'text', text: 'Read this nutrition label.' }
        ]
      }
    ]
  });
  const parsed = labelOutput.safeParse(jsonAnswer(response));
  if (!parsed.success) console.error(`Anthropic API: unexpected label from ${model}: ${JSON.stringify(response.body).slice(0, 500)}`);
  if (!parsed.success || !parsed.data.readable) throw new HttpError(422, 'labelUnreadable');
  const d = parsed.data;
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    name: d.name?.trim() || null,
    brand: d.brand?.trim() || null,
    kcal: r(d.kcal_100g),
    protein: r(d.protein_100g),
    carbs: r(d.carbs_100g),
    fat: r(d.fat_100g),
    fiber: d.fiber_100g != null && d.fiber_100g >= 0 ? r(d.fiber_100g) : null,
    servingG: d.serving_g != null && d.serving_g > 0 ? r(d.serving_g) : null,
    servingLabel: d.serving_label?.trim() || null
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

/** Where a photo lives now: rebuilt from the data folder, so a backup restored elsewhere still finds it. */
export const photoFile = (ctx: Pick<AiContext, 'dataDir'>, row: { userId: number; path: string }) =>
  join(ctx.dataDir, 'photos', String(row.userId), basename(row.path));

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

export function deletePhoto(ctx: Pick<AiContext, 'db' | 'dataDir'>, userId: number, photoId: string) {
  const row = ctx.db.select().from(photos).where(and(eq(photos.id, photoId), eq(photos.userId, userId))).get();
  if (!row) return;
  rmSync(photoFile(ctx, row), { force: true });
  ctx.db.delete(photos).where(eq(photos.id, photoId)).run();
}

/** Photos of estimates that never became an entry (or whose entry got another photo), a day after the upload. */
export function purgeOrphanPhotos(ctx: Pick<AiContext, 'db' | 'dataDir'>, now = Date.now()): number {
  const rows = ctx.db
    .select({ id: photos.id, userId: photos.userId })
    .from(photos)
    .leftJoin(entries, eq(entries.photoId, photos.id))
    .where(and(isNull(entries.id), lt(photos.createdAt, new Date(now - 24 * 60 * 60 * 1000).toISOString())))
    .all();
  for (const row of rows) deletePhoto(ctx, row.userId, row.id);
  return rows.length;
}

// ---------- Background calculation ----------

/** How many times an entry found Anthropic overloaded. In memory: a restart starts the count over. */
const busyAttempts = new Map<number, number>();
const MAX_BUSY_ATTEMPTS = 8;

/**
 * Estimates entries saved with calc_status = 'pending' (text only), oldest first, one at a time.
 * `busy` means Anthropic is overloaded: the run stops there and the caller should wait before the next.
 */
export async function processPendingEntries(
  ctx: AiContext,
  getUser: (id: number) => UserRow | undefined,
  limit = 5
): Promise<{ done: number; busy: boolean }> {
  const pending = ctx.db.select().from(entries).where(eq(entries.calcStatus, 'pending')).orderBy(asc(entries.id)).limit(50).all();
  const toManual = (id: number, code: string) =>
    ctx.db.update(entries).set({ calcStatus: 'manual', calcError: code, updatedAt: new Date().toISOString() }).where(eq(entries.id, id)).run();
  // Users who hit their per-minute limit in this run: their other entries wait, everyone else's go on.
  const waiting = new Set<number>();
  let done = 0;
  let tried = 0;
  for (const entry of pending) {
    if (tried >= limit) break;
    if (waiting.has(entry.userId)) continue;
    const user = getUser(entry.userId);
    if (!user?.active) {
      toManual(entry.id, 'aiDisabled');
      continue;
    }
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
      if (code === 'aiTooFast') {
        waiting.add(entry.userId);
        continue;
      }
      if (code === 'aiBusy') {
        const attempts = (busyAttempts.get(entry.id) ?? 0) + 1;
        if (attempts < MAX_BUSY_ATTEMPTS) {
          busyAttempts.set(entry.id, attempts);
          return { done, busy: true };
        }
      }
      // Anything that will not go away by itself falls back to manual input.
      toManual(entry.id, code);
    }
    busyAttempts.delete(entry.id);
    tried++;
  }
  return { done, busy: false };
}

export function startPendingWorker(ctx: AiContext, getUser: (id: number) => UserRow | undefined, log: { error(o: unknown, m?: string): void }) {
  let running = false;
  // While Anthropic is overloaded the wait doubles, from 30 seconds up to 10 minutes.
  let pause = 0;
  let notBefore = 0;
  let purgedAt = 0;
  const run = async () => {
    if (running || Date.now() < notBefore) return;
    running = true;
    try {
      const { busy } = await processPendingEntries(ctx, getUser);
      pause = busy ? Math.min(pause ? pause * 2 : 30_000, 600_000) : 0;
      notBefore = Date.now() + pause;
      if (Date.now() - purgedAt > 60 * 60 * 1000) {
        purgedAt = Date.now();
        purgeOrphanPhotos(ctx);
      }
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

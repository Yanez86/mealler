// SPDX-License-Identifier: AGPL-3.0-or-later
// MCP server (Streamable HTTP transport, stateless JSON responses) exposing the user's diary to claude.ai.
// Every call is authenticated with an OAuth access token and only ever touches that user's data.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, between, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  FOOD_CATEGORIES,
  NUTRIENTS,
  addDays,
  isIsoDate,
  isLocale,
  normalizeQuantity,
  nowIn,
  sumValues,
  todayIn,
  type Nutrient
} from '@mealler/shared';
import type { AppContext } from './app.ts';
import type { UserRow } from './auth.ts';
import type { Db } from './db/index.ts';
import { entries, slots } from './db/schema.ts';
import { isMcpEnabled, publicBase, userFromBearer } from './oauth.ts';
import { buildDay, thresholdsOn, toEntry, userSlots } from './services.ts';
import { lastWeight, listWeights, saveWeight } from './routes/weight.ts';
import { logProduct, searchProducts } from './routes/products.ts';
import { products } from './db/schema.ts';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PROTOCOL = '2025-06-18';

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

class ToolError extends Error {}

const amount = z.number().min(0).max(100000);
const optionalAmount = amount.nullable().optional();
const item = z.object({
  name: z.string().min(1).max(200),
  quantity: z.string().max(100).optional(),
  kcal: amount,
  protein: amount,
  carbs: amount,
  fat: amount,
  fiber: optionalAmount
});

const round = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);
const dateOrToday = (user: UserRow, date?: string) => {
  if (date && !isIsoDate(date)) throw new ToolError('date must be YYYY-MM-DD');
  return date ?? todayIn(user.timezone);
};

const nutrientSchema = (description: string) => ({ type: 'number', minimum: 0, description });
const categorySchema = {
  type: 'string',
  enum: [...FOOD_CATEGORIES],
  description: 'Optional food category for the colored icon. Omit it: the app guesses it from the description.'
};
const itemSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Food name, e.g. "Pasta al pomodoro"' },
    quantity: { type: 'string', description: 'Estimated amount, preferably in g or ml, e.g. "120 g" or "200 ml"' },
    kcal: nutrientSchema('Energy in kcal'),
    protein: nutrientSchema('Protein in grams'),
    carbs: nutrientSchema('Carbohydrates in grams'),
    fat: nutrientSchema('Fat in grams'),
    fiber: nutrientSchema('Fibre in grams')
  },
  required: ['name', 'kcal', 'protein', 'carbs', 'fat']
};

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  run(db: Db, user: UserRow, args: unknown): unknown;
}

function resolveSlot(db: Db, user: UserRow, slotId?: number, slotName?: string) {
  const active = userSlots(db, user.id, false);
  if (slotId != null) {
    // Any of the user's slots, also one added to a single day (get_day lists them).
    const found = db.select().from(slots).where(and(eq(slots.id, slotId), eq(slots.userId, user.id))).get();
    if (found) return found;
  }
  if (slotName) {
    const wanted = slotName.trim().toLowerCase();
    const found = active.find((s) => s.name.toLowerCase() === wanted);
    if (found) return found;
  }
  throw new ToolError(
    `Unknown meal slot. Use one of: ${active.map((s) => `${s.name} (id ${s.id}, ${s.time})`).join(', ')}`
  );
}

function dayForClaude(db: Db, user: UserRow, date: string) {
  const day = buildDay(db, user, date);
  return {
    date: day.date,
    is_today: day.date === day.today,
    totals: Object.fromEntries(
      NUTRIENTS.map((n) => [n, { value: day.summary[n].value, min: day.summary[n].min, max: day.summary[n].max, status: day.summary[n].status }])
    ),
    slots: day.slots.map(({ slot, entries: list, totals, skipped }) => ({
      slot_id: slot.id,
      name: slot.name,
      time: slot.time,
      kcal: totals.kcal,
      // The user marked this meal as skipped.
      skipped,
      entries: list.map((e) => ({
        entry_id: e.id,
        description: e.description,
        quantity: e.quantity,
        kcal: e.kcal,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
        fiber: e.fiber
      }))
    }))
  };
}

const TOOLS: Tool[] = [
  {
    name: 'list_slots',
    title: 'List meal slots',
    description: "Lists the user's meal slots (e.g. breakfast, lunch) with their id and time. Call this before add_entry if you don't know the slots.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: (db, user) => ({
      slots: userSlots(db, user.id, false).map((s) => ({ slot_id: s.id, name: s.name, time: s.time }))
    })
  },
  {
    name: 'get_day',
    title: 'Get a diary day',
    description: "Returns one day of the diary: every slot with its entries, and the day's totals compared with the user's optional min/max thresholds.",
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: "YYYY-MM-DD; defaults to today in the user's time zone" } }
    },
    annotations: { readOnlyHint: true },
    run: (db, user, args) => {
      const { date } = z.object({ date: z.string().optional() }).parse(args ?? {});
      return dayForClaude(db, user, dateOrToday(user, date));
    }
  },
  {
    name: 'add_entry',
    title: 'Log a meal',
    description:
      'Logs what the user ate into a meal slot. Estimate realistic portions and nutritional values yourself ' +
      '(kcal, protein, carbs, fat, fibre in grams) and pass one item per food: with two or more items, ' +
      'each item becomes its own diary entry (named after the item), so the user can check and correct every food. ' +
      'With a single item or none, one entry is created and totals are computed from items when you omit them. ' +
      'For a dish whose ingredients the user lists (e.g. "carbonara: 70 g pasta, 50 g guanciale"), set dish: true: ' +
      'one entry named after the dish is created, with the ingredients as its breakdown. ' +
      'Pick the slot by slot_id or slot_name.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short description of the meal, in the user\'s language' },
        date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
        slot_id: { type: 'integer' },
        slot_name: { type: 'string', description: 'Slot name, e.g. "Pranzo"' },
        quantity: { type: 'string' },
        items: { type: 'array', items: itemSchema, description: 'One item per food; two or more items become separate entries, unless dish is true' },
        dish: { type: 'boolean', description: 'true when the items are the ingredients of one dish: one entry, items as its breakdown' },
        kcal: nutrientSchema('Total kcal'),
        protein: nutrientSchema('Total protein, g'),
        carbs: nutrientSchema('Total carbohydrates, g'),
        fat: nutrientSchema('Total fat, g'),
        fiber: nutrientSchema('Total fibre, g'),
        notes: { type: 'string' },
        category: categorySchema
      },
      required: ['description']
    },
    run: (db, user, args) => {
      const a = z
        .object({
          description: z.string().trim().min(1).max(1000),
          date: z.string().optional(),
          slot_id: z.number().int().optional(),
          slot_name: z.string().max(100).optional(),
          quantity: z.string().max(200).optional(),
          items: z.array(item).max(50).optional(),
          dish: z.boolean().optional(),
          kcal: optionalAmount,
          protein: optionalAmount,
          carbs: optionalAmount,
          fat: optionalAmount,
          fiber: optionalAmount,
          notes: z.string().max(2000).optional(),
          category: z.enum(FOOD_CATEGORIES).nullable().optional()
        })
        .parse(args ?? {});
      const date = dateOrToday(user, a.date);
      const slot = resolveSlot(db, user, a.slot_id, a.slot_name);
      const locale = isLocale(user.locale) ? user.locale : 'it';
      if (a.items && a.items.length > 1 && !a.dish) {
        // One diary entry per food, as in the app; the meal's notes go on the first one.
        const list = a.items;
        const rows = db.transaction((tx) =>
          list.map((i, index) =>
            tx
              .insert(entries)
              .values({
                userId: user.id,
                slotId: slot.id,
                date,
                description: i.name,
                quantity: normalizeQuantity(i.quantity, locale),
                kcal: round(i.kcal),
                protein: round(i.protein),
                carbs: round(i.carbs),
                fat: round(i.fat),
                fiber: round(i.fiber),
                notes: index === 0 ? a.notes ?? null : null,
                source: 'claude_ai',
                calcStatus: 'calculated'
              })
              .returning()
              .get()
          )
        );
        const logged = rows.map(toEntry);
        return {
          entry_id: logged[0].id,
          entry_ids: logged.map((e) => e.id),
          slot: slot.name,
          date,
          entries: logged.map((e) => ({
            entry_id: e.id,
            description: e.description,
            quantity: e.quantity,
            kcal: e.kcal,
            protein: e.protein,
            carbs: e.carbs,
            fat: e.fat,
            fiber: e.fiber,
            kcal_check_failed: e.kcalMismatch
          })),
          day: dayForClaude(db, user, date).totals
        };
      }
      const fromItems = a.items?.length
        ? sumValues(a.items.map((i) => ({ kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, fiber: i.fiber ?? null })))
        : null;
      const pick = (n: Nutrient) => round(a[n] ?? fromItems?.[n] ?? null);
      const row = db
        .insert(entries)
        .values({
          userId: user.id,
          slotId: slot.id,
          date,
          description: a.description,
          // A dish's first item is an ingredient, not the portion.
          quantity: normalizeQuantity(a.quantity ?? (a.dish ? undefined : a.items?.[0]?.quantity), locale),
          kcal: pick('kcal'),
          protein: pick('protein'),
          carbs: pick('carbs'),
          fat: pick('fat'),
          fiber: pick('fiber'),
          detail: a.items ? JSON.stringify(a.items) : null,
          notes: a.notes ?? null,
          category: a.category ?? null,
          source: 'claude_ai',
          calcStatus: 'calculated'
        })
        .returning()
        .get();
      const entry = toEntry(row);
      return {
        entry_id: entry.id,
        slot: slot.name,
        date,
        logged: { kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, fiber: entry.fiber },
        kcal_check_failed: entry.kcalMismatch,
        day: dayForClaude(db, user, date).totals
      };
    }
  },
  {
    name: 'update_entry',
    title: 'Correct a meal entry',
    description: 'Corrects an existing entry (description, slot, date or nutritional values). Only the fields you pass change.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: { type: 'integer' },
        description: { type: 'string' },
        date: { type: 'string' },
        slot_id: { type: 'integer' },
        slot_name: { type: 'string' },
        quantity: { type: 'string' },
        kcal: nutrientSchema('kcal'),
        protein: nutrientSchema('g'),
        carbs: nutrientSchema('g'),
        fat: nutrientSchema('g'),
        fiber: nutrientSchema('g'),
        notes: { type: 'string' },
        category: {
          type: ['string', 'null'],
          enum: [...FOOD_CATEGORIES, null],
          description: 'Food category for the colored icon; null goes back to the one guessed from the description.'
        }
      },
      required: ['entry_id']
    },
    run: (db, user, args) => {
      const a = z
        .object({
          entry_id: z.number().int(),
          description: z.string().trim().min(1).max(1000).optional(),
          date: z.string().optional(),
          slot_id: z.number().int().optional(),
          slot_name: z.string().max(100).optional(),
          quantity: z.string().max(200).optional(),
          kcal: optionalAmount,
          protein: optionalAmount,
          carbs: optionalAmount,
          fat: optionalAmount,
          fiber: optionalAmount,
          notes: z.string().max(2000).optional(),
          category: z.enum(FOOD_CATEGORIES).nullable().optional()
        })
        .parse(args ?? {});
      const where = and(eq(entries.id, a.entry_id), eq(entries.userId, user.id));
      const current = db.select().from(entries).where(where).get();
      if (!current) throw new ToolError('Entry not found');
      const changes: Partial<typeof entries.$inferInsert> = { updatedAt: new Date().toISOString() };
      if (a.description !== undefined) changes.description = a.description;
      if (a.quantity !== undefined) changes.quantity = a.quantity;
      if (a.notes !== undefined) changes.notes = a.notes;
      if (a.category !== undefined) changes.category = a.category;
      if (a.date !== undefined) changes.date = dateOrToday(user, a.date);
      if (a.slot_id !== undefined || a.slot_name !== undefined) changes.slotId = resolveSlot(db, user, a.slot_id, a.slot_name).id;
      for (const n of NUTRIENTS) if (a[n] !== undefined) changes[n] = round(a[n]);
      const row = db.update(entries).set(changes).where(where).returning().get();
      return { entry: toEntry(row!) };
    }
  },
  {
    name: 'delete_entry',
    title: 'Delete a meal entry',
    description: 'Deletes an entry from the diary. Ask the user to confirm first.',
    inputSchema: { type: 'object', properties: { entry_id: { type: 'integer' } }, required: ['entry_id'] },
    annotations: { destructiveHint: true },
    run: (db, user, args) => {
      const { entry_id } = z.object({ entry_id: z.number().int() }).parse(args ?? {});
      const row = db
        .delete(entries)
        .where(and(eq(entries.id, entry_id), eq(entries.userId, user.id)))
        .returning()
        .get();
      if (!row) throw new ToolError('Entry not found');
      return { deleted: entry_id };
    }
  },
  {
    name: 'get_thresholds',
    title: 'Get thresholds',
    description: "Returns the user's current optional daily min/max thresholds for kcal, protein, carbs, fat and fibre (null = not set).",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: (db, user) => {
      const t = thresholdsOn(db, user.id, todayIn(user.timezone));
      return Object.fromEntries(NUTRIENTS.map((n) => [n, { min: t[n].min, max: t[n].max }]));
    }
  },
  {
    name: 'get_summary',
    title: 'Summarise a period',
    description:
      'Daily totals over a date range (max 92 days) with averages over the days that have entries, ' +
      'plus current thresholds. Use it for questions like "how was my protein this week?".',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        to: { type: 'string', description: 'YYYY-MM-DD, inclusive; defaults to today' }
      },
      required: ['from']
    },
    annotations: { readOnlyHint: true },
    run: (db, user, args) => {
      const a = z.object({ from: z.string(), to: z.string().optional() }).parse(args ?? {});
      const to = dateOrToday(user, a.to);
      const from = dateOrToday(user, a.from);
      if (from > to) throw new ToolError('from must not be after to');
      if (from < addDays(to, -91)) throw new ToolError('The range can cover at most 92 days');
      const rows = db
        .select()
        .from(entries)
        .where(and(eq(entries.userId, user.id), between(entries.date, from, to)))
        .all()
        .map(toEntry);
      const byDate = new Map<string, typeof rows>();
      for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
      const days = [...byDate.entries()]
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([date, list]) => ({ date, entries: list.length, ...sumValues(list) }));
      const averages = Object.fromEntries(
        NUTRIENTS.map((n) => [n, days.length ? Math.round((days.reduce((s, d) => s + d[n], 0) / days.length) * 10) / 10 : null])
      );
      const t = thresholdsOn(db, user.id, to);
      return {
        from,
        to,
        days_with_entries: days.length,
        averages,
        thresholds: Object.fromEntries(NUTRIENTS.map((n) => [n, { min: t[n].min, max: t[n].max }])),
        days
      };
    }
  },
  {
    name: 'search_foods',
    title: 'Search the food library',
    description:
      'Searches the shared library of packaged foods (values per 100 g, from the package label). ' +
      'Check it before estimating branded products: if found, use log_food so the exact label values are used.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Name, brand or barcode' } }, required: ['query'] },
    annotations: { readOnlyHint: true },
    run: (db, _user, args) => {
      const { query } = z.object({ query: z.string().max(100) }).parse(args ?? {});
      return {
        foods: searchProducts(db, query, 10).map((p) => ({
          product_id: p.id,
          name: p.name,
          brand: p.brand,
          per_100g: { kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber },
          serving_g: p.servingG,
          serving_label: p.servingLabel
        }))
      };
    }
  },
  {
    name: 'log_food',
    title: 'Log a library food',
    description: 'Logs a food from the library into a meal slot, by grams or by servings; values are computed from the label.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'integer' },
        grams: { type: 'number' },
        servings: { type: 'number', description: 'Number of servings, when the product has a serving size' },
        slot_id: { type: 'integer' },
        slot_name: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' }
      },
      required: ['product_id']
    },
    run: (db, user, args) => {
      const a = z
        .object({
          product_id: z.number().int(),
          grams: z.number().min(0.1).max(5000).optional(),
          servings: z.number().min(0.1).max(100).optional(),
          slot_id: z.number().int().optional(),
          slot_name: z.string().max(100).optional(),
          date: z.string().optional()
        })
        .parse(args ?? {});
      const product = db.select().from(products).where(eq(products.id, a.product_id)).get();
      if (!product) throw new ToolError('Food not found in the library');
      const grams = a.grams ?? (a.servings != null && product.servingG ? a.servings * product.servingG : null);
      if (grams == null) throw new ToolError('Give grams (this food has no serving size)');
      const slot = resolveSlot(db, user, a.slot_id, a.slot_name);
      const entry = logProduct(db, user, product, { slotId: slot.id, date: dateOrToday(user, a.date), grams });
      return { entry_id: entry.id, slot: slot.name, grams, logged: { kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, fiber: entry.fiber } };
    }
  },
  {
    name: 'log_weight',
    title: 'Log body weight',
    description: "Records the user's body weight in kg for a date (one value per day; a new value replaces the old one).",
    inputSchema: {
      type: 'object',
      properties: {
        kg: { type: 'number', minimum: 20, maximum: 400 },
        date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
        note: { type: 'string' }
      },
      required: ['kg']
    },
    run: (db, user, args) => {
      const a = z.object({ kg: z.number().min(20).max(400), date: z.string().optional(), note: z.string().max(500).optional() }).parse(args ?? {});
      return saveWeight(db, user.id, dateOrToday(user, a.date), a.kg, a.note ?? null);
    }
  },
  {
    name: 'get_weights',
    title: 'Get weight history',
    description: "Returns the user's weigh-ins between two dates (max 366 days) and the latest one.",
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string', description: 'defaults to today' } },
      required: ['from']
    },
    annotations: { readOnlyHint: true },
    run: (db, user, args) => {
      const a = z.object({ from: z.string(), to: z.string().optional() }).parse(args ?? {});
      const to = dateOrToday(user, a.to);
      const from = dateOrToday(user, a.from);
      if (from > to || from < addDays(to, -365)) throw new ToolError('Use a range of at most 366 days, from before to');
      return { latest: lastWeight(db, user.id), weights: listWeights(db, user.id, from, to) };
    }
  }
];

function instructions(user: UserRow): string {
  const { date, time } = nowIn(user.timezone);
  return [
    "Mealler is the user's self-hosted food diary.",
    `The user's time zone is ${user.timezone}; it is now ${date} ${time} there. Interpret "today", "yesterday", "this morning" in that zone.`,
    'When the user says what they ate, estimate portions and nutritional values yourself and call add_entry with one item per food (each food becomes its own diary entry); for a dish whose ingredients they list, pass the ingredients as items with dish: true (one entry); choose the slot that matches the meal (list_slots shows them).',
    user.units === 'us'
      ? 'The user prefers US units (oz, fl oz, cups, lb): talk in those, but the tools take grams and kg, so convert before calling them.'
      : 'The user uses metric units (g, ml, kg).',
    'Values are estimates: say so briefly, and offer to correct them with update_entry.',
    "Reply in the user's language. Never invent entries the user did not mention."
  ].join(' ');
}

async function handle(db: Db, user: UserRow, version: string, msg: JsonRpcMessage) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });

  switch (msg.method) {
    case 'initialize': {
      const requested = String(msg.params?.protocolVersion ?? '');
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mealler', title: 'Mealler', version },
        instructions: instructions(user)
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          ...(annotations ? { annotations } : {})
        }))
      });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      try {
        const result = tool.run(db, user, msg.params?.arguments ?? {});
        return ok({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });
      } catch (e) {
        const message =
          e instanceof ToolError
            ? e.message
            : e instanceof z.ZodError
              ? `Invalid arguments: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
              : 'Internal error';
        return ok({ content: [{ type: 'text', text: message }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function mcpRoutes(app: FastifyInstance, { db, config }: AppContext) {
  const challenge = (request: FastifyRequest, reply: FastifyReply) =>
    reply
      .status(401)
      .header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${publicBase(config, request)}/.well-known/oauth-protected-resource", scope="mealler"`
      )
      .send({ error: 'unauthorized' });

  app.post('/mcp', async (request, reply) => {
    if (!isMcpEnabled(db)) return reply.status(404).send({ error: 'notFound' });
    const user = userFromBearer(db, request);
    if (!user) return challenge(request, reply);

    const body = request.body as JsonRpcMessage | JsonRpcMessage[] | undefined;
    const batch = Array.isArray(body);
    const messages = batch ? body : [body ?? {}];
    const responses = [];
    for (const msg of messages) {
      if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        responses.push({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
        continue;
      }
      if (msg.id === undefined) continue; // notification: no response
      responses.push(await handle(db, user, config.version, msg));
    }
    if (!responses.length) return reply.status(202).send();
    reply.header('Cache-Control', 'no-store');
    return reply.type('application/json').send(batch ? responses : responses[0]);
  });

  // This server does not open server-to-client streams.
  app.get('/mcp', async (_request, reply) => reply.status(405).header('Allow', 'POST').send());
  app.delete('/mcp', async (_request, reply) => reply.status(405).header('Allow', 'POST').send());

}

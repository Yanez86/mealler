// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Product, ProductDraft } from '@mealler/shared';
import type { AppContext } from '../app.ts';
import { requireUser, type UserRow } from '../auth.ts';
import type { Db } from '../db/index.ts';
import { entries, products, slots } from '../db/schema.ts';
import { badRequest, conflict, forbidden, notFound } from '../http.ts';
import { getSetting } from '../services.ts';
import { toEntry } from '../services.ts';
import { readNutritionLabel } from '../ai.ts';
import { valuesFor } from '../foods.ts';
import { zDate, zId } from '../validation.ts';

export const isOffEnabled = (db: Db) => getSetting(db, 'off_enabled') !== 'false';

export function toProduct(row: typeof products.$inferSelect, user: UserRow): Product {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    kcal: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    servingG: row.servingG,
    servingLabel: row.servingLabel,
    source: row.source,
    uses: row.uses,
    canEdit: user.role === 'admin' || row.createdBy === user.id
  };
}

export function searchProducts(db: Db, query: string, limit = 20) {
  const q = query.trim().toLowerCase();
  const where = q
    ? sql`(lower(${products.name}) LIKE ${`%${q}%`} OR lower(coalesce(${products.brand}, '')) LIKE ${`%${q}%`} OR ${products.barcode} = ${q})`
    : undefined;
  return db.select().from(products).where(where).orderBy(desc(products.uses), products.name).limit(limit).all();
}

/** Creates a diary entry from a product and an amount in grams. */
export function logProduct(
  db: Db,
  user: UserRow,
  product: typeof products.$inferSelect,
  input: { slotId: number; date: string; grams: number; description?: string }
) {
  const values = valuesFor(product, input.grams);
  const label = [product.name, product.brand].filter(Boolean).join(' ');
  const row = db
    .insert(entries)
    .values({
      userId: user.id,
      slotId: input.slotId,
      date: input.date,
      description: input.description ?? label,
      quantity: `${Math.round(input.grams * 10) / 10} g`,
      ...values,
      source: 'library',
      calcStatus: 'manual',
      productId: product.id,
      amountG: input.grams
    })
    .returning()
    .get();
  db.update(products).set({ uses: sql`${products.uses} + 1` }).where(eq(products.id, product.id)).run();
  return toEntry(row);
}

const per100 = z.number().min(0).max(1000);
const productBody = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).nullable().optional(),
  barcode: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/)
    .nullable()
    .optional(),
  kcal: z.number().min(0).max(1000),
  protein: per100,
  carbs: per100,
  fat: per100,
  fiber: per100.nullable().optional(),
  servingG: z.number().min(0.1).max(5000).nullable().optional(),
  servingLabel: z.string().trim().max(100).nullable().optional(),
  source: z.enum(['manual', 'label', 'openfoodfacts']).default('manual')
});

export async function productRoutes(app: FastifyInstance, { db, ai, foods }: AppContext) {
  app.addHook('preHandler', async (request) => {
    requireUser(request);
  });

  const get = (id: number) => db.select().from(products).where(eq(products.id, id)).get();
  const editable = (user: UserRow, row: typeof products.$inferSelect) => {
    if (user.role !== 'admin' && row.createdBy !== user.id) throw forbidden();
  };

  app.get('/products', async (request) => {
    const user = requireUser(request);
    const { q } = z.object({ q: z.string().max(100).default('') }).parse(request.query);
    return searchProducts(db, q).map((r) => toProduct(r, user));
  });

  app.get('/products/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const row = get(id);
    if (!row) throw notFound();
    return toProduct(row, user);
  });

  /** Barcode: the library first, then (if allowed) Open Food Facts as a draft to confirm. */
  app.get('/products/barcode/:code', async (request): Promise<{ product: Product | null; draft: ProductDraft | null }> => {
    const user = requireUser(request);
    const { code } = z.object({ code: z.string().regex(/^\d{8,14}$/) }).parse(request.params);
    const row = db.select().from(products).where(eq(products.barcode, code)).get();
    if (row) return { product: toProduct(row, user), draft: null };
    if (!isOffEnabled(db)) return { product: null, draft: null };
    return { product: null, draft: await foods.lookup(code) };
  });

  app.post('/products/label', { bodyLimit: 10 * 1024 * 1024 }, async (request): Promise<ProductDraft> => {
    const user = requireUser(request);
    const { photo } = z
      .object({
        photo: z.object({
          mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          data: z.string().min(100).max(8 * 1024 * 1024).regex(/^[A-Za-z0-9+/=]+$/)
        })
      })
      .parse(request.body);
    const v = await readNutritionLabel(ai, user, photo);
    return { ...v, name: v.name ?? '', barcode: null, source: 'label' };
  });

  app.post('/products', async (request) => {
    const user = requireUser(request);
    const b = productBody.parse(request.body);
    if (b.barcode && db.select().from(products).where(eq(products.barcode, b.barcode)).get()) throw conflict('barcodeTaken');
    const row = db
      .insert(products)
      .values({
        name: b.name,
        brand: b.brand || null,
        barcode: b.barcode || null,
        kcal: b.kcal,
        protein: b.protein,
        carbs: b.carbs,
        fat: b.fat,
        fiber: b.fiber ?? null,
        servingG: b.servingG ?? null,
        servingLabel: b.servingLabel || null,
        source: b.source,
        createdBy: user.id
      })
      .returning()
      .get();
    return toProduct(row, user);
  });

  app.patch('/products/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const row = get(id);
    if (!row) throw notFound();
    editable(user, row);
    const b = productBody.partial().parse(request.body);
    if (b.barcode && b.barcode !== row.barcode && db.select().from(products).where(eq(products.barcode, b.barcode)).get()) {
      throw conflict('barcodeTaken');
    }
    const updated = db
      .update(products)
      .set({ ...b, updatedAt: new Date().toISOString() })
      .where(eq(products.id, id))
      .returning()
      .get();
    return toProduct(updated, user);
  });

  app.delete('/products/:id', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const row = get(id);
    if (!row) throw notFound();
    editable(user, row);
    db.delete(products).where(eq(products.id, id)).run();
    return { ok: true };
  });

  app.post('/products/:id/log', async (request) => {
    const user = requireUser(request);
    const { id } = z.object({ id: zId }).parse(request.params);
    const b = z
      .object({
        slotId: zId,
        date: zDate,
        grams: z.number().min(0.1).max(5000).optional(),
        servings: z.number().min(0.1).max(100).optional()
      })
      .parse(request.body);
    const product = get(id);
    if (!product) throw notFound();
    const slot = db.select().from(slots).where(and(eq(slots.id, b.slotId), eq(slots.userId, user.id))).get();
    if (!slot) throw badRequest('slot');
    const grams = b.grams ?? (b.servings != null && product.servingG ? b.servings * product.servingG : null);
    if (grams == null) throw badRequest('amount');
    return logProduct(db, user, product, { slotId: slot.id, date: b.date, grams });
  });
}

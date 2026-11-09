// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared food library: packaged products with values per 100 g, barcode lookup on Open Food Facts.
import type { ProductDraft } from '@mealler/shared';

export type BarcodeLookup = (barcode: string) => Promise<ProductDraft | null>;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
};

/**
 * Looks a barcode up on Open Food Facts (open database, ODbL). Only the barcode is sent.
 * Returns null when the product is unknown or the service cannot be reached.
 */
export function openFoodFactsLookup(version: string): BarcodeLookup {
  return async (barcode) => {
    const fields = 'product_name,product_name_it,product_name_en,brands,nutriments,serving_quantity,serving_size';
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fields}`, {
        headers: { 'User-Agent': `Mealler/${version} (self-hosted food diary; https://github.com/Yanez86/mealler)` },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
      if (data.status !== 1 || !data.product) return null;
      const p = data.product;
      const n = (p.nutriments ?? {}) as Record<string, unknown>;
      let kcal = num(n['energy-kcal_100g']);
      if (kcal == null && num(n['energy_100g']) != null) kcal = Math.round(((num(n['energy_100g']) as number) / 4.184) * 10) / 10;
      const name = String(p.product_name_it || p.product_name || p.product_name_en || '').trim();
      const brand = String(p.brands ?? '').split(',')[0].trim();
      const servingG = num(p.serving_quantity);
      return {
        name: name || barcode,
        brand: brand || null,
        barcode,
        kcal,
        protein: num(n['proteins_100g']),
        carbs: num(n['carbohydrates_100g']),
        fat: num(n['fat_100g']),
        fiber: num(n['fiber_100g']),
        servingG: servingG && servingG > 0 ? servingG : null,
        servingLabel: typeof p.serving_size === 'string' && p.serving_size ? p.serving_size.slice(0, 100) : null,
        source: 'openfoodfacts'
      };
    } catch {
      return null;
    }
  };
}

/** Nutrient values for an amount in grams, from per-100 g values. */
export function valuesFor(
  p: { kcal: number; protein: number; carbs: number; fat: number; fiber: number | null },
  grams: number
) {
  const f = grams / 100;
  const r = (v: number) => Math.round(v * f * 10) / 10;
  return { kcal: r(p.kcal), protein: r(p.protein), carbs: r(p.carbs), fat: r(p.fat), fiber: p.fiber == null ? null : r(p.fiber) };
}

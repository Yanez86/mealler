// SPDX-License-Identifier: AGPL-3.0-or-later

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

export type NutrientValues = Record<Nutrient, number | null>;

export const NUTRIENT_UNITS: Record<Nutrient, 'kcal' | 'g'> = {
  kcal: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
  fiber: 'g'
};

export type ThresholdStatus = 'none' | 'under' | 'ok' | 'over';

/** Compare a daily total with optional min/max bounds. */
export function thresholdStatus(value: number, min: number | null, max: number | null): ThresholdStatus {
  if (min == null && max == null) return 'none';
  if (min != null && value < min) return 'under';
  if (max != null && value > max) return 'over';
  return 'ok';
}

/**
 * Colour of a progress bar: green inside the thresholds, yellow close to them (from 70% of the
 * minimum, or in the last stretch before the maximum), red far below the minimum or over the maximum.
 */
export type ThresholdTone = 'none' | 'good' | 'near' | 'bad';

/** From this share of the minimum a value counts as close to it. */
export const NEAR_MIN = 0.7;
/** The last 10% before the maximum (never more than half of the min–max range) counts as close to it. */
export const NEAR_MAX = 0.1;

export function thresholdTone(value: number, min: number | null, max: number | null): ThresholdTone {
  if (min == null && max == null) return 'none';
  if (max != null && value > max) return 'bad';
  if (min != null && value < min) return value >= min * NEAR_MIN ? 'near' : 'bad';
  if (max != null) {
    const room = Math.min(max * NEAR_MAX, min != null ? (max - min) / 2 : Infinity);
    if (room > 0 && value >= max - room) return 'near';
  }
  return 'good';
}

export function emptyValues(): NutrientValues {
  return { kcal: null, protein: null, carbs: null, fat: null, fiber: null };
}

/** Sum nutrient values, treating null as 0. Result values are rounded to one decimal. */
export function sumValues(items: NutrientValues[]): Record<Nutrient, number> {
  const out: Record<Nutrient, number> = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const item of items) {
    for (const n of NUTRIENTS) out[n] += item[n] ?? 0;
  }
  for (const n of NUTRIENTS) out[n] = Math.round(out[n] * 10) / 10;
  return out;
}

/**
 * Energy check: kcal should be close to 4·protein + 4·carbs + 9·fat.
 * Returns true when the declared kcal differs from the macro estimate by more than the tolerance.
 * Fiber is ignored (its energy contribution is small and labels vary).
 */
export function kcalMismatch(v: NutrientValues, tolerance = 0.25): boolean {
  if (v.kcal == null || v.protein == null || v.carbs == null || v.fat == null) return false;
  const estimate = 4 * v.protein + 4 * v.carbs + 9 * v.fat;
  if (estimate < 20 && v.kcal < 20) return false;
  return Math.abs(v.kcal - estimate) > Math.max(v.kcal, estimate) * tolerance;
}

/**
 * A non-negative number as people type it: "12,5" or "12.5", and with thousands separators as the
 * language writes them ("1.800" in Italian, "1,800" in English): 1.800 kcal is not 1,8.
 * null = left empty; undefined = not a number, to be reported rather than read as empty.
 */
export function parseNumber(text: string, locale: string): number | null | undefined {
  let v = text.trim();
  if (!v) return null;
  const grouped = locale === 'it' ? /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/ : /^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/;
  if (grouped.test(v)) v = v.split(locale === 'it' ? '.' : ',').join('');
  v = v.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : undefined;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// One food of the add-meal screen. Every row becomes its own diary entry, with its quantity and values.
import {
  NUTRIENTS,
  SYSTEM_UNITS,
  inSystem,
  parseQuantity,
  roundQuantity,
  storedQuantity,
  type Estimate,
  type EstimateItem,
  type FoodCategory,
  type FoodPart,
  type Locale,
  type Nutrient,
  type NutrientValues,
  type Quantity,
  type QuantityUnit,
  type UnitSystem
} from '@mealler/shared';
import { parseNumber } from './state.svelte';

export interface FoodRow {
  key: string;
  name: string;
  /** The amount as typed, in `unit`. */
  amount: string;
  unit: QuantityUnit;
  /** A saved quantity that is not a plain amount ("una porzione"): kept until a number replaces it. */
  legacyQuantity: string | null;
  values: Record<Nutrient, string>;
  /** Per-food breakdown of the last estimate. */
  items: EstimateItem[] | null;
  /** The values as Claude estimated them, to tell a calculated entry from a corrected one. */
  estimatedValues: Record<Nutrient, string> | null;
  estimate: Pick<Estimate, 'confidence' | 'notes'> | null;
  /** Chosen by the user; null = guessed from the name. */
  category: FoodCategory | null;
  /** The favorite this row was filled from, if any: saving the meal counts as one more use of it. */
  favoriteId: number | null;
  estimating: boolean;
}

let counter = 0;

const emptyValues = (): Record<Nutrient, string> => ({ kcal: '', protein: '', carbs: '', fat: '', fiber: '' });

export const toNumber = (s: string): number | null => parseNumber(s) ?? null;

/** True when the quantity or a value of the row holds something that is not a number: saving must stop. */
export const hasBadNumber = (row: FoodRow) =>
  [row.amount, ...NUTRIENTS.map((n) => row.values[n])].some((v) => parseNumber(v) === undefined);

export function toText(n: number | null | undefined, locale: Locale): string {
  return n == null ? '' : String(n).replace('.', locale === 'it' ? ',' : '.');
}

export function newRow(units: UnitSystem, name = ''): FoodRow {
  return {
    key: `r${++counter}`,
    name,
    amount: '',
    unit: SYSTEM_UNITS[units][0],
    legacyQuantity: null,
    values: emptyValues(),
    items: null,
    estimatedValues: null,
    estimate: null,
    category: null,
    favoriteId: null,
    estimating: false
  };
}

/** Shows a quantity in the user's system: 113 g is "4 oz" for US units. */
export function setQuantity(row: FoodRow, q: Quantity, units: UnitSystem, locale: Locale) {
  const shown = roundQuantity(inSystem(q, units));
  row.amount = toText(shown.amount, locale);
  row.unit = shown.unit;
  row.legacyQuantity = null;
}

/** Fills the quantity from saved text: a plain amount becomes number + unit, anything else is kept aside. */
export function setQuantityText(row: FoodRow, text: string | null | undefined, units: UnitSystem, locale: Locale) {
  if (!text) return;
  const q = parseQuantity(text);
  if (q) setQuantity(row, q, units, locale);
  else {
    row.amount = '';
    row.legacyQuantity = text;
  }
}

/** The text saved in the diary: always metric ("113 g"), or the old free text when no number was typed. */
export function rowQuantity(row: FoodRow, locale: Locale): string | null {
  const amount = toNumber(row.amount);
  if (amount != null && amount > 0) return storedQuantity({ amount, unit: row.unit }, locale);
  return row.legacyQuantity;
}

export function rowValues(row: FoodRow): NutrientValues {
  return Object.fromEntries(NUTRIENTS.map((n) => [n, toNumber(row.values[n])])) as NutrientValues;
}

export const hasValues = (row: FoodRow) => NUTRIENTS.some((n) => toNumber(row.values[n]) != null);

export const isEdited = (row: FoodRow) =>
  !!row.estimatedValues && NUTRIENTS.some((n) => row.values[n] !== row.estimatedValues![n]);

export function setValues(row: FoodRow, values: Partial<Record<Nutrient, number | null | undefined>>, locale: Locale) {
  for (const n of NUTRIENTS) row.values[n] = toText(values[n], locale);
}

/** Puts an estimate on a row: totals as values, the breakdown, and a snapshot to detect corrections. */
export function applyEstimate(row: FoodRow, estimate: Estimate, locale: Locale) {
  setValues(row, estimate.totals, locale);
  row.items = estimate.items;
  row.estimatedValues = { ...row.values };
  row.estimate = { confidence: estimate.confidence, notes: estimate.notes };
}

export function clearEstimate(row: FoodRow) {
  row.values = emptyValues();
  row.items = null;
  row.estimatedValues = null;
  row.estimate = null;
}

export function rowFromPart(part: FoodPart, units: UnitSystem, locale: Locale): FoodRow {
  const row = newRow(units, part.name);
  if (part.quantity) setQuantity(row, part.quantity, units, locale);
  return row;
}

/** A food of a photo estimate as its own row, values already filled. */
export function rowFromItem(item: EstimateItem, estimate: Estimate, units: UnitSystem, locale: Locale): FoodRow {
  const row = newRow(units, item.name);
  setQuantityText(row, item.quantity, units, locale);
  setValues(row, item, locale);
  row.items = [item];
  row.estimatedValues = { ...row.values };
  row.estimate = { confidence: estimate.confidence, notes: estimate.notes };
  return row;
}

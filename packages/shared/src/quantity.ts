// SPDX-License-Identifier: AGPL-3.0-or-later
// Food quantities: the unit tags of the add-meal screen in the metric and US customary systems,
// reading typed quantities ("100 g", "2 cucchiai", "1/2 cup") and meals that list several foods.
// Quantities are stored in metric (grams, millilitres) and converted only to show them.
import type { Locale } from './i18n.ts';

export const UNIT_SYSTEMS = ['metric', 'us'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export function isUnitSystem(value: unknown): value is UnitSystem {
  return typeof value === 'string' && (UNIT_SYSTEMS as readonly string[]).includes(value);
}

export const QUANTITY_UNITS = ['g', 'ml', 'oz', 'floz', 'cup', 'unit', 'package', 'tbsp', 'tsp'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

/** The unit tags offered in each system; the first one is the default. */
export const SYSTEM_UNITS: Record<UnitSystem, readonly QuantityUnit[]> = {
  metric: ['g', 'ml', 'unit', 'package', 'tbsp', 'tsp'],
  us: ['oz', 'floz', 'cup', 'unit', 'package', 'tbsp', 'tsp']
};

export interface Quantity {
  amount: number;
  unit: QuantityUnit;
}

export const G_PER_OZ = 28.349523125;
export const ML_PER_FLOZ = 29.5735295625;
export const ML_PER_CUP = 236.5882365;
export const KG_PER_LB = 0.45359237;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

/** Body weight in the user's system (kg or lb). */
export const weightIn = (kg: number, system: UnitSystem) => (system === 'us' ? kgToLb(kg) : kg);
/** Body weight typed in the user's system, back to kg. */
export const weightFrom = (value: number, system: UnitSystem) => (system === 'us' ? lbToKg(value) : value);
export const weightUnit = (system: UnitSystem) => (system === 'us' ? 'lb' : 'kg');

/** Water as people read it: "1,25 l" or "750 ml", or "42 fl oz" with US units. */
export function formatWater(ml: number, system: UnitSystem, locale: string): string {
  const n = (v: number, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
  if (system === 'us') return `${n(ml / ML_PER_FLOZ)} fl oz`;
  return ml >= 1000 ? `${n(ml / 1000, 2)} l` : `${n(ml)} ml`;
}

const LABELS: Record<Locale, Record<QuantityUnit, [one: string, other: string]>> = {
  it: {
    g: ['g', 'g'],
    ml: ['ml', 'ml'],
    oz: ['oz', 'oz'],
    floz: ['fl oz', 'fl oz'],
    cup: ['tazza', 'tazze'],
    unit: ['unità', 'unità'],
    package: ['confezione', 'confezioni'],
    tbsp: ['cucchiaio', 'cucchiai'],
    tsp: ['cucchiaino', 'cucchiaini']
  },
  en: {
    g: ['g', 'g'],
    ml: ['ml', 'ml'],
    oz: ['oz', 'oz'],
    floz: ['fl oz', 'fl oz'],
    cup: ['cup', 'cups'],
    unit: ['unit', 'units'],
    package: ['package', 'packages'],
    tbsp: ['tbsp', 'tbsp'],
    tsp: ['tsp', 'tsp']
  }
};

export function unitLabel(unit: QuantityUnit, locale: Locale, amount = 1): string {
  const [one, other] = (LABELS[locale] ?? LABELS.en)[unit];
  return amount === 1 ? one : other;
}

/** Grams and millilitres are whole numbers (one decimal below 10), the other units keep up to two decimals. */
function decimals(q: Quantity): number {
  if (q.unit === 'g' || q.unit === 'ml') return q.amount < 10 ? 1 : 0;
  if (q.unit === 'oz' || q.unit === 'floz') return 1;
  return 2;
}

export function roundQuantity(q: Quantity): Quantity {
  const f = 10 ** decimals(q);
  return { amount: Math.round(q.amount * f) / f, unit: q.unit };
}

/** "100 g", "2 cucchiai", "1,5 confezioni". No digit grouping, so the text always reads back the same. */
export function formatQuantity(q: Quantity, locale: Locale): string {
  const r = roundQuantity(q);
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals(q), useGrouping: false }).format(r.amount);
  return `${n} ${unitLabel(r.unit, locale, r.amount)}`;
}

/** Stored form: ounces become grams, fluid ounces and cups millilitres; the other units stay. */
export function toMetric(q: Quantity): Quantity {
  switch (q.unit) {
    case 'oz':
      return { amount: q.amount * G_PER_OZ, unit: 'g' };
    case 'floz':
      return { amount: q.amount * ML_PER_FLOZ, unit: 'ml' };
    case 'cup':
      return { amount: q.amount * ML_PER_CUP, unit: 'ml' };
    default:
      return q;
  }
}

/** A stored quantity as the user sees it: in the US system grams become ounces and millilitres fluid ounces. */
export function inSystem(q: Quantity, system: UnitSystem): Quantity {
  if (system === 'metric') return toMetric(q);
  if (q.unit === 'g') return { amount: q.amount / G_PER_OZ, unit: 'oz' };
  if (q.unit === 'ml') return { amount: q.amount / ML_PER_FLOZ, unit: 'floz' };
  return q;
}

/** The text saved in the diary for a quantity typed in any unit. */
export function storedQuantity(q: Quantity, locale: Locale): string {
  return formatQuantity(toMetric(q), locale);
}

/** A saved quantity in the user's system and language; text that is not a plain quantity is shown as it is. */
export function displayQuantity(text: string | null | undefined, system: UnitSystem, locale: Locale): string | null {
  if (!text) return null;
  const q = parseQuantity(text);
  return q ? formatQuantity(inSystem(q, system), locale) : text;
}

/** Writes a typed quantity in the stored form ("1 cup" → "237 ml"), or returns the text unchanged. */
export function normalizeQuantity(text: string | null | undefined, locale: Locale): string | null {
  if (!text?.trim()) return null;
  const q = parseQuantity(text);
  return q ? storedQuantity(q, locale) : text.trim();
}

// ---------- Parsing ----------

/** Unit words in Italian and English. `factor` converts the word into `unit` (kg → 1000 g). */
const UNIT_WORDS: [words: string[], unit: QuantityUnit, factor: number][] = [
  [['g', 'gr', 'grammo', 'grammi', 'gram', 'grams', 'gramme', 'grammes'], 'g', 1],
  [['kg', 'chilo', 'chili', 'chilogrammo', 'chilogrammi', 'kilo', 'kilos', 'kilogram', 'kilograms'], 'g', 1000],
  [['hg', 'etto', 'etti'], 'g', 100],
  [['ml', 'millilitro', 'millilitri', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], 'ml', 1],
  [['cl', 'centilitro', 'centilitri'], 'ml', 10],
  [['dl', 'decilitro', 'decilitri'], 'ml', 100],
  [['l', 'lt', 'litro', 'litri', 'liter', 'liters', 'litre', 'litres'], 'ml', 1000],
  [['fl oz', 'fl. oz', 'fl.oz', 'floz', 'fluid ounce', 'fluid ounces'], 'floz', 1],
  [['oz', 'oncia', 'once', 'ounce', 'ounces'], 'oz', 1],
  [['lb', 'lbs', 'libbra', 'libbre', 'pound', 'pounds'], 'oz', 16],
  [['cup', 'cups', 'tazza', 'tazze'], 'cup', 1],
  [['unità', 'unita', 'pezzo', 'pezzi', 'pz', 'unit', 'units', 'piece', 'pieces', 'pc', 'pcs'], 'unit', 1],
  [
    ['confezione', 'confezioni', 'conf', 'pacchetto', 'pacchetti', 'package', 'packages', 'pack', 'packs', 'packet', 'packets'],
    'package',
    1
  ],
  [['cucchiaio', 'cucchiai', 'tbsp', 'tbs', 'tablespoon', 'tablespoons'], 'tbsp', 1],
  [['cucchiaino', 'cucchiaini', 'tsp', 'teaspoon', 'teaspoons'], 'tsp', 1]
];

const UNIT_INDEX = new Map<string, { unit: QuantityUnit; factor: number }>();
for (const [words, unit, factor] of UNIT_WORDS) for (const w of words) UNIT_INDEX.set(w, { unit, factor });

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*');
// Longest first, so "fl oz" wins over "oz" and "kg" over "g". A unit must end the word ("g" is not "gamberi").
const UNIT_RE = [...UNIT_INDEX.keys()].sort((a, b) => b.length - a.length).map(escape).join('|');

const WORD_NUMBERS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  "un'": 1,
  mezzo: 0.5,
  mezza: 0.5,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  a: 1,
  an: 1,
  one: 1,
  half: 0.5,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6
};
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const DIGITS_RE = String.raw`\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+|\d*[½¼¾⅓⅔]`;
const WORDS_RE = Object.keys(WORD_NUMBERS)
  .filter((w) => !w.endsWith("'"))
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join('|');
// A number in digits, or a number word followed by a space ("una mela", not "unità"), or "un'" before a name.
const NUM = String.raw`(${DIGITS_RE}|(?:${WORDS_RE})(?=\s)|un'(?=\S))`;

function numberValue(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s in WORD_NUMBERS) return WORD_NUMBERS[s];
  const frac = /^(\d*)([½¼¾⅓⅔])$/.exec(s);
  if (frac) return Number(frac[1] || 0) + FRACTIONS[frac[2]];
  const mixed = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(s);
  if (mixed) {
    const den = Number(mixed[3]);
    return den ? Number(mixed[1] ?? 0) + Number(mixed[2]) / den : null;
  }
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function unitOf(raw: string): { unit: QuantityUnit; factor: number } | null {
  const s = raw.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ').replace('fl. oz', 'fl oz');
  return UNIT_INDEX.get(s) ?? UNIT_INDEX.get(s.replace(/\s/g, '')) ?? null;
}

function makeQuantity(num: string, unit: string | undefined): Quantity | null {
  const amount = numberValue(num);
  if (amount == null || amount <= 0 || amount > 100000) return null;
  if (!unit) return { amount, unit: 'unit' };
  const u = unitOf(unit);
  return u ? { amount: amount * u.factor, unit: u.unit } : null;
}

const END = String.raw`(?=$|[\s.,;:!?)\]])\.?`;
const QUANTITY_ONLY = new RegExp(String.raw`^\s*${NUM}\s*(${UNIT_RE})?${END}\s*$`, 'i');
const LEADING_WITH_UNIT = new RegExp(String.raw`^${NUM}\s*(${UNIT_RE})${END}\s*(?:(?:di|of)\s+|d')?(.*)$`, 'i');
const LEADING_COUNT = new RegExp(String.raw`^${NUM}(?:\s+|(?<='))(.+)$`, 'i');
const TRAILING = new RegExp(String.raw`^(.+?)[\s,:(\-–]+${NUM}\s*(${UNIT_RE})${END}\s*\)?\s*$`, 'i');

/** A whole text that is just a quantity: "100 g", "2 cucchiai", "1/2 cup", "un etto". */
export function parseQuantity(text: string): Quantity | null {
  const m = QUANTITY_ONLY.exec(text);
  if (!m) return null;
  // A bare number word ("una") is not a quantity; a bare digit is a count of units.
  if (!m[2] && !/\d|[½¼¾⅓⅔]/.test(m[1])) return null;
  return makeQuantity(m[1], m[2]);
}

export interface FoodPart {
  name: string;
  quantity: Quantity | null;
}

const capitalize = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

/** One food with its quantity, written before ("100 g di pollo", "2 uova") or after ("pollo 100 g", "pollo (100 g)"). */
export function parseFoodPart(text: string): FoodPart {
  const t = text.replace(/\s+/g, ' ').trim();
  let m = LEADING_WITH_UNIT.exec(t);
  if (m) {
    const quantity = makeQuantity(m[1], m[2]);
    if (quantity) return { name: capitalize(m[3].trim()), quantity };
  }
  m = TRAILING.exec(t);
  if (m) {
    const quantity = makeQuantity(m[2], m[3]);
    if (quantity) return { name: capitalize(m[1].trim()), quantity };
  }
  m = LEADING_COUNT.exec(t);
  if (m && !/^(?:di|d'|of)\b/i.test(m[2])) {
    const quantity = makeQuantity(m[1], undefined);
    if (quantity) return { name: capitalize(m[2].trim()), quantity };
  }
  return { name: capitalize(t), quantity: null };
}

// New lines, semicolons, "+" and commas that are not decimal commas ("1,5 kg") separate foods.
const SEPARATORS = /\r?\n|;|\+|(?<!\d),|,(?!\d)/;
// "e"/"and" separates foods only when a quantity follows: "100 g di pollo e 100 g di patate" is two foods,
// "patate e cipolle" is one. "con"/"with" only before digits ("pasta con 50 g di parmigiano").
const NUM_START = String.raw`(?:\d|[½¼¾⅓⅔]|(?:un|uno|una|mezzo|mezza|due|tre|quattro|cinque|sei)\b|un')`;
const NUM_START_EN = String.raw`(?:\d|[½¼¾⅓⅔]|(?:a|an|one|half|two|three|four|five|six)\b)`;
const CONJUNCTIONS = new RegExp(
  String.raw`\s+(?:(?:e|ed)\s+(?=${NUM_START})|(?:and|&)\s+(?=${NUM_START_EN}|${NUM_START})|(?:con|with)\s+(?=\d))`,
  'i'
);

// "Carbonara: 70 g pasta, 50 g guanciale, 1 uovo": a dish followed by its ingredients.
const DISH = /^([^:\n]+):([\s\S]+)$/;

/** Splits a meal into its foods: "100 g di petto di pollo e 100 g di patate e cipolle" gives two foods. */
export function splitFoods(text: string): FoodPart[] {
  // A dish stays one food, estimated as a whole; "pollo: 100 g" is a food with its quantity, not a dish.
  const dish = DISH.exec(text.trim());
  if (dish && dish[1].trim() && splitFoods(dish[2]).length) {
    const ingredients = dish[2].trim().split(/\s*\n\s*/).join(', ');
    return [{ name: capitalize(`${dish[1].trim()}: ${ingredients}`.replace(/[ \t]+/g, ' ')), quantity: null }];
  }
  const out: FoodPart[] = [];
  for (const chunk of text.split(SEPARATORS)) {
    for (const piece of chunk.split(CONJUNCTIONS)) {
      if (!piece.trim()) continue;
      const part = parseFoodPart(piece);
      const previous = out[out.length - 1];
      // "pollo, 100 g": a quantity on its own belongs to the food before it.
      if (!part.name && part.quantity && previous && !previous.quantity) previous.quantity = part.quantity;
      else if (part.name) out.push(part);
    }
  }
  return out;
}

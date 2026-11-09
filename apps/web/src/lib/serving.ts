// SPDX-License-Identifier: AGPL-3.0-or-later
// How a library food's portion reads in lists: "1 pezzo (50 g) · 195 kcal".
import { formatQuantity, inSystem } from '@mealler/shared';
import { app } from './state.svelte';

interface Serving {
  kcal: number;
  servingG: number | null;
  servingLabel: string | null;
}

/** The portion with its weight, in the user's units; the label alone when it already states the grams. */
export function servingText(p: Serving): string | null {
  if (!p.servingG) return p.servingLabel || null;
  const weight = formatQuantity(inSystem({ amount: p.servingG, unit: 'g' }, app.user?.units ?? 'metric'), app.locale);
  const label = p.servingLabel?.trim();
  if (!label) return weight;
  const grams = [...label.matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)].map((m) => Number(m[1].replace(',', '.')));
  if (app.user?.units !== 'us' && grams.some((g) => Math.abs(g - p.servingG!) < 0.05)) return label;
  return `${label} (${weight})`;
}

/** Calories in one portion, or null when the portion has no weight. */
export const servingKcal = (p: Serving): number | null => (p.servingG ? (p.kcal * p.servingG) / 100 : null);

// SPDX-License-Identifier: AGPL-3.0-or-later
// Water as the user reads and types it: litres and millilitres, or US fluid ounces. Stored in ml.
import { ML_PER_FLOZ } from '@mealler/shared';
import { app, formatNumber } from './state.svelte';

const us = () => app.user?.units === 'us';

/** "1,25 l", "750 ml" or "42 fl oz". */
export function waterText(ml: number): string {
  if (us()) return `${formatNumber(ml / ML_PER_FLOZ)} fl oz`;
  return ml >= 1000 ? `${formatNumber(ml / 1000, 2)} l` : `${formatNumber(ml)} ml`;
}

/** The unit the daily goal is typed in: litres, or fl oz. */
export const goalUnit = () => (us() ? 'fl oz' : 'l');
/** The unit a glass is typed in: ml, or fl oz. */
export const glassUnit = () => (us() ? 'fl oz' : 'ml');

/** The goal in its typed unit, and back to ml. */
export const goalIn = (ml: number) => (us() ? Math.round(ml / ML_PER_FLOZ) : Math.round(ml / 10) / 100);
export const goalFrom = (value: number) => Math.round(us() ? value * ML_PER_FLOZ : value * 1000);
/** A glass in its typed unit, and back to ml. */
export const glassIn = (ml: number) => (us() ? Math.round((ml / ML_PER_FLOZ) * 10) / 10 : ml);
export const glassFrom = (value: number) => Math.round(us() ? value * ML_PER_FLOZ : value);

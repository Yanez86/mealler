// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Nutrient, NutrientValues, ThresholdStatus } from './nutrients.ts';
import type { Locale } from './i18n.ts';
import type { FoodCategory } from './foods.ts';
import type { UnitSystem } from './quantity.ts';

export type Role = 'admin' | 'user';
export type Theme = 'system' | 'light' | 'dark';
export type EntrySource = 'manual' | 'claude_ai' | 'in_app' | 'favorite' | 'library';
export type CalcStatus = 'manual' | 'pending' | 'calculated' | 'corrected';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  locale: Locale;
  timezone: string;
  theme: Theme;
  /** Metric or US customary units for food quantities and body weight; data is stored in metric. */
  units: UnitSystem;
  active: boolean;
  remindersEnabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  remindersPausedUntil: string | null;
  lastSeenVersion: string | null;
  weightReminderEnabled: boolean;
  weightReminderWeeks: number;
  weightReminderWeekday: number;
  weightReminderTime: string;
}

export interface Favorite extends NutrientValues {
  id: number;
  name: string;
  description: string;
  quantity: string | null;
  slotId: number | null;
  uses: number;
  items: EstimateItem[] | null;
  /** Chosen by the user; null = guessed from the name. */
  category: FoodCategory | null;
}

/** A frequent meal, derived from the diary (not saved as favorite). */
export interface Suggestion extends NutrientValues {
  description: string;
  quantity: string | null;
  times: number;
  items: EstimateItem[] | null;
  category: FoodCategory | null;
}

export interface WeightEntry {
  date: string;
  kg: number;
  note: string | null;
}

export interface TrendDay extends Record<Nutrient, number> {
  date: string;
  entries: number;
  limits: Record<Nutrient, { min: number | null; max: number | null }>;
}

export interface TrendsResponse {
  from: string;
  to: string;
  days: TrendDay[];
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface Status {
  setupRequired: boolean;
  registrationOpen: boolean;
  version: string;
  latestVersion: string | null;
  sourceUrl: string;
}

export interface Slot {
  id: number;
  name: string;
  time: string;
  days: number;
  position: number;
  reminderEnabled: boolean;
  reminderDelayMin: number;
  archived: boolean;
}

export interface Entry extends NutrientValues {
  id: number;
  slotId: number;
  date: string;
  description: string;
  quantity: string | null;
  source: EntrySource;
  calcStatus: CalcStatus;
  notes: string | null;
  kcalMismatch: boolean;
  photoId: string | null;
  calcError: string | null;
  items: EstimateItem[] | null;
  productId: number | null;
  amountG: number | null;
  /** Chosen by the user; null = guessed from the description. */
  category: FoodCategory | null;
}

export interface EstimateItem {
  name: string;
  quantity?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
}

export interface Estimate {
  description: string;
  items: EstimateItem[];
  totals: NutrientValues;
  confidence: 'low' | 'medium' | 'high';
  notes: string | null;
  model: string;
  costUsd: number;
}

export interface AiStatus {
  enabled: boolean;
  capUsd: number | null;
  spentUsd: number;
  capReached: boolean;
  requestsToday: number;
  dailyRequests: number | null;
  limitReached: boolean;
}

export interface AiSettings {
  enabled: boolean;
  hasKey: boolean;
  keyHint: string | null;
  modelText: string;
  modelPhoto: string;
  monthlyCapUsd: number | null;
  dailyRequests: number | null;
  dailyTokens: number | null;
  perMinute: number | null;
  instanceMonthlyUsd: number | null;
  keepPhotos: boolean;
  models: string[];
}

export interface Threshold {
  nutrient: Nutrient;
  min: number | null;
  max: number | null;
  validFrom: string;
}

export interface DaySlot {
  slot: Slot;
  entries: Entry[];
  totals: Record<Nutrient, number>;
}

export interface NutrientSummary {
  value: number;
  min: number | null;
  max: number | null;
  status: ThresholdStatus;
}

export interface DayResponse {
  date: string;
  today: string;
  slots: DaySlot[];
  summary: Record<Nutrient, NutrientSummary>;
}

export interface Invite {
  token: string;
  email: string | null;
  expiresAt: string;
  usedAt: string | null;
  url: string;
}

/** A packaged food in the shared library. Nutrient values are per 100 g. */
export interface Product {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  servingG: number | null;
  servingLabel: string | null;
  source: 'manual' | 'label' | 'openfoodfacts';
  /** Chosen by the user; null = guessed from the name. */
  category: FoodCategory | null;
  uses: number;
  canEdit: boolean;
}

/** Product data proposed by a barcode lookup or a label photo, to be confirmed by the user. */
export interface ProductDraft {
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  servingG: number | null;
  servingLabel: string | null;
  source: 'manual' | 'label' | 'openfoodfacts';
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Nutrient, NutrientValues, ThresholdStatus } from './nutrients.ts';
import type { Locale } from './i18n.ts';

export type Role = 'admin' | 'user';
export type Theme = 'system' | 'light' | 'dark';
export type EntrySource = 'manual' | 'claude_ai' | 'in_app' | 'favorite';
export type CalcStatus = 'manual' | 'pending' | 'calculated' | 'corrected';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  locale: Locale;
  timezone: string;
  theme: Theme;
  active: boolean;
  remindersEnabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  remindersPausedUntil: string | null;
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

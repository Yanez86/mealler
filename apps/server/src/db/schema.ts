// SPDX-License-Identifier: AGPL-3.0-or-later
// Drizzle table definitions. They mirror migrations/*.sql, which remain the source of truth.
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { FOOD_CATEGORIES, UNIT_SYSTEMS } from '@mealler/shared';

const now = () => new Date().toISOString();

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull(),
  locale: text('locale').notNull().default('it'),
  timezone: text('timezone').notNull().default('Europe/Rome'),
  theme: text('theme', { enum: ['system', 'light', 'dark'] }).notNull().default('system'),
  units: text('units', { enum: UNIT_SYSTEMS }).notNull().default('metric'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  lastSeenVersion: text('last_seen_version'),
  remindersEnabled: integer('reminders_enabled', { mode: 'boolean' }).notNull().default(true),
  quietStart: text('quiet_start'),
  quietEnd: text('quiet_end'),
  remindersPausedUntil: text('reminders_paused_until'),
  weightReminderEnabled: integer('weight_reminder_enabled', { mode: 'boolean' }).notNull().default(false),
  weightReminderWeeks: integer('weight_reminder_weeks').notNull().default(2),
  weightReminderWeekday: integer('weight_reminder_weekday').notNull().default(1),
  weightReminderTime: text('weight_reminder_time').notNull().default('07:30'),
  weightReminderLastSent: text('weight_reminder_last_sent'),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull().$defaultFn(now),
  lastUsedAt: text('last_used_at')
});

export const reminderLog = sqliteTable('reminder_log', {
  userId: integer('user_id').notNull(),
  slotId: integer('slot_id').notNull(),
  date: text('date').notNull(),
  sentAt: text('sent_at').notNull()
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const invites = sqliteTable('invites', {
  token: text('token').primaryKey(),
  email: text('email'),
  expiresAt: integer('expires_at').notNull(),
  createdBy: integer('created_by'),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const slots = sqliteTable('slots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(),
  time: text('time').notNull(),
  days: integer('days').notNull().default(127),
  position: integer('position').notNull().default(0),
  reminderEnabled: integer('reminder_enabled', { mode: 'boolean' }).notNull().default(true),
  reminderDelayMin: integer('reminder_delay_min').notNull().default(15),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  slotId: integer('slot_id').notNull(),
  date: text('date').notNull(),
  description: text('description').notNull(),
  quantity: text('quantity'),
  kcal: real('kcal'),
  protein: real('protein'),
  carbs: real('carbs'),
  fat: real('fat'),
  fiber: real('fiber'),
  detail: text('detail'),
  source: text('source', { enum: ['manual', 'claude_ai', 'in_app', 'favorite', 'library'] }).notNull().default('manual'),
  calcStatus: text('calc_status', { enum: ['manual', 'pending', 'calculated', 'corrected'] })
    .notNull()
    .default('manual'),
  notes: text('notes'),
  photoId: text('photo_id'),
  calcError: text('calc_error'),
  productId: integer('product_id'),
  amountG: real('amount_g'),
  category: text('category', { enum: FOOD_CATEGORIES }),
  createdAt: text('created_at').notNull().$defaultFn(now),
  updatedAt: text('updated_at').notNull().$defaultFn(now)
});

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  path: text('path').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const aiUsage = sqliteTable('ai_usage', {
  userId: integer('user_id').notNull(),
  month: text('month').notNull(),
  model: text('model').notNull(),
  requests: integer('requests').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0)
});

export const thresholds = sqliteTable('thresholds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  nutrient: text('nutrient').notNull(),
  min: real('min'),
  max: real('max'),
  validFrom: text('valid_from').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const oauthClients = sqliteTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientSecretHash: text('client_secret_hash'),
  name: text('name').notNull(),
  redirectUris: text('redirect_uris').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const oauthCodes = sqliteTable('oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  userId: integer('user_id').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  scope: text('scope').notNull(),
  expiresAt: integer('expires_at').notNull()
});

export const oauthTokens = sqliteTable('oauth_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: text('client_id').notNull(),
  userId: integer('user_id').notNull(),
  accessHash: text('access_hash').notNull(),
  refreshHash: text('refresh_hash').notNull(),
  scope: text('scope').notNull(),
  accessExpiresAt: integer('access_expires_at').notNull(),
  refreshExpiresAt: integer('refresh_expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(now),
  lastUsedAt: text('last_used_at')
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export const aiUsageDaily = sqliteTable('ai_usage_daily', {
  userId: integer('user_id').notNull(),
  day: text('day').notNull(),
  requests: integer('requests').notNull().default(0),
  tokens: integer('tokens').notNull().default(0)
});

export const favorites = sqliteTable('favorites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  quantity: text('quantity'),
  kcal: real('kcal'),
  protein: real('protein'),
  carbs: real('carbs'),
  fat: real('fat'),
  fiber: real('fiber'),
  detail: text('detail'),
  slotId: integer('slot_id'),
  category: text('category', { enum: FOOD_CATEGORIES }),
  uses: integer('uses').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const weights = sqliteTable('weights', {
  userId: integer('user_id').notNull(),
  date: text('date').notNull(),
  kg: real('kg').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull().$defaultFn(now)
});

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  brand: text('brand'),
  barcode: text('barcode'),
  kcal: real('kcal').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  fiber: real('fiber'),
  servingG: real('serving_g'),
  servingLabel: text('serving_label'),
  source: text('source', { enum: ['manual', 'label', 'openfoodfacts'] }).notNull().default('manual'),
  category: text('category', { enum: FOOD_CATEGORIES }),
  createdBy: integer('created_by'),
  uses: integer('uses').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(now),
  updatedAt: text('updated_at').notNull().$defaultFn(now)
});

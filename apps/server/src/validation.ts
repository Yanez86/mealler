// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';
import { FOOD_CATEGORIES, LOCALES, NUTRIENTS, UNIT_SYSTEMS, isIsoDate, isValidTime } from '@mealler/shared';

export const zEmail = z.string().trim().toLowerCase().email().max(200);
export const zPassword = z.string().min(10).max(200);
export const zName = z.string().trim().min(1).max(100);
export const zLocale = z.enum(LOCALES);
export const zTheme = z.enum(['system', 'light', 'dark']);
export const zUnits = z.enum(UNIT_SYSTEMS);
export const zTimezone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  });
export const zDate = z.string().refine(isIsoDate);
export const zTime = z.string().refine(isValidTime);
export const zId = z.coerce.number().int().positive();
export const zDays = z.number().int().min(1).max(127);
export const zNutrient = z.enum(NUTRIENTS);
/** A food category chosen by the user; null goes back to the automatic one. */
export const zFoodCategory = z.enum(FOOD_CATEGORIES).nullable();

/** Optional nutrient amount: null clears it, numbers are rounded to one decimal. */
export const zAmount = z
  .number()
  .min(0)
  .max(100000)
  .nullable()
  .transform((v) => (v == null ? null : Math.round(v * 10) / 10));

export const zOptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const zNum = z.number().min(0).max(100000);
export const zEstimateItem = z.object({
  name: z.string().min(1).max(200),
  quantity: z.string().max(100).optional(),
  kcal: zNum,
  protein: zNum,
  carbs: zNum,
  fat: zNum,
  fiber: zNum.nullable().optional()
});

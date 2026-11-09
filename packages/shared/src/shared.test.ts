// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thresholdStatus, sumValues, kcalMismatch } from './nutrients.ts';
import { isIsoDate, addDays, isoWeekday, slotActiveOn, todayIn, isValidTime, inTimeRange, nowIn } from './dates.ts';
import { translate, MESSAGES } from './i18n.ts';
import { isNewerVersion } from './version.ts';
import { foodCategory, mealCategory, FOOD_CATEGORIES } from './foods.ts';

test('thresholdStatus handles optional bounds', () => {
  assert.equal(thresholdStatus(50, null, null), 'none');
  assert.equal(thresholdStatus(50, 60, null), 'under');
  assert.equal(thresholdStatus(50, null, 40), 'over');
  assert.equal(thresholdStatus(50, 40, 60), 'ok');
  assert.equal(thresholdStatus(60, 40, 60), 'ok');
});

test('sumValues treats null as zero and rounds', () => {
  const total = sumValues([
    { kcal: 100.04, protein: 1, carbs: null, fat: 2, fiber: null },
    { kcal: 50, protein: null, carbs: 3, fat: 0.25, fiber: 1 }
  ]);
  assert.deepEqual(total, { kcal: 150, protein: 1, carbs: 3, fat: 2.3, fiber: 1 });
});

test('kcalMismatch flags inconsistent entries', () => {
  assert.equal(kcalMismatch({ kcal: 150, protein: 6, carbs: 18, fat: 6, fiber: null }), false);
  assert.equal(kcalMismatch({ kcal: 900, protein: 6, carbs: 18, fat: 6, fiber: null }), true);
  assert.equal(kcalMismatch({ kcal: 150, protein: null, carbs: 18, fat: 6, fiber: null }), false);
});

test('date helpers', () => {
  assert.equal(isIsoDate('2026-11-09'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isoWeekday('2026-11-09'), 1);
  assert.equal(isoWeekday('2026-11-08'), 7);
  assert.equal(slotActiveOn(127, '2026-11-09'), true);
  assert.equal(slotActiveOn(1 << 6, '2026-11-09'), false);
  assert.equal(todayIn('Europe/Rome', new Date('2026-11-09T23:30:00Z')), '2026-11-10');
  assert.equal(isValidTime('08:30'), true);
  assert.equal(isValidTime('24:00'), false);
});

test('time ranges and time zones', () => {
  assert.equal(inTimeRange('23:00', '22:00', '07:00'), true);
  assert.equal(inTimeRange('06:59', '22:00', '07:00'), true);
  assert.equal(inTimeRange('07:00', '22:00', '07:00'), false);
  assert.equal(inTimeRange('13:00', '12:00', '14:00'), true);
  assert.equal(inTimeRange('13:00', null, '14:00'), false);
  assert.deepEqual(nowIn('Europe/Rome', new Date('2026-11-09T12:05:00Z')), { date: '2026-11-09', time: '13:05' });
});

test('translations are complete and interpolate', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.it).sort());
  assert.equal(translate('it', 'day.filled', { n: 3, total: 5 }), '3 di 5 compilati');
  assert.equal(translate('en', 'day.kcalLeft', { n: 760 }), '760 left');
});

test('version comparison', () => {
  assert.equal(isNewerVersion('0.3.0', '0.2.0'), true);
  assert.equal(isNewerVersion('0.10.0', '0.9.9'), true);
  assert.equal(isNewerVersion('0.2.0', '0.2.0'), false);
  assert.equal(isNewerVersion(null, '0.2.0'), false);
  assert.equal(isNewerVersion('0.3.0', 'dev'), false);
});

test('food categories are guessed from the description', () => {
  assert.equal(foodCategory('Pasta e fagioli'), 'pasta');
  assert.equal(foodCategory('Caffè e cornetto'), 'coffee');
  assert.equal(foodCategory("Spremuta d'arancia"), 'drinks');
  assert.equal(foodCategory('Arancia'), 'fruit');
  assert.equal(foodCategory('Frutta secca'), 'nuts');
  assert.equal(foodCategory('Burro di arachidi'), 'nuts');
  assert.equal(foodCategory('Insalata di riso'), 'pasta');
  assert.equal(foodCategory('Insalata mista'), 'vegetables');
  assert.equal(foodCategory('Latte macchiato'), 'coffee');
  assert.equal(foodCategory('Yogurt greco'), 'dairy');
  assert.equal(foodCategory('Fagiolini'), 'vegetables');
  assert.equal(foodCategory('Pesca'), 'fruit');
  assert.equal(foodCategory('Pesce spada'), 'fish');
  assert.equal(foodCategory('TIRAMISÙ'), 'sweets');
  assert.equal(foodCategory('Scrambled eggs'), 'eggs');
  assert.equal(foodCategory('Pranzo al ristorante'), 'other');
  assert.equal(foodCategory(''), 'other');
  for (const c of FOOD_CATEGORIES) assert.ok(translate('it', `food.${c}`) !== `food.${c}`);
});

test('meal category falls back to the item with the most calories', () => {
  const items = [
    { name: 'Insalata', kcal: 40, protein: 1, carbs: 3, fat: 2 },
    { name: 'Lasagne', kcal: 620, protein: 30, carbs: 50, fat: 30 }
  ];
  assert.equal(mealCategory(['Pranzo al ristorante'], items), 'pasta');
  assert.equal(mealCategory(['Cena', 'Pizza margherita'], null), 'pizza');
  assert.equal(mealCategory(['Cena'], []), 'other');
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Achievements: the catalogue (shared by server and app). The server works out which are unlocked.

export type AchievementTier = 'bronze' | 'silver' | 'gold';
export type AchievementFamily = 'first' | 'streak' | 'weight' | 'water' | 'balance' | 'collection' | 'habits';

export interface AchievementDef {
  id: string;
  family: AchievementFamily;
  tier: AchievementTier;
  /** How many of something it takes; 1 = a first time. */
  target: number;
}

const a = (id: string, family: AchievementFamily, tier: AchievementTier, target = 1): AchievementDef => ({ id, family, tier, target });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  a('scan1', 'first', 'bronze'),
  a('day1', 'first', 'bronze'),
  a('dish1', 'first', 'bronze'),
  a('estimate1', 'first', 'bronze'),
  a('weight1', 'first', 'bronze'),
  a('label1', 'first', 'bronze'),
  a('favorite1', 'first', 'bronze'),
  a('streak3', 'streak', 'bronze', 3),
  a('streak7', 'streak', 'bronze', 7),
  a('streak30', 'streak', 'silver', 30),
  a('days100', 'streak', 'silver', 100),
  a('days365', 'streak', 'gold', 365),
  a('weights10', 'weight', 'silver', 10),
  a('weeks12', 'weight', 'gold', 12),
  a('water1', 'water', 'bronze'),
  a('water7', 'water', 'silver', 7),
  a('water30', 'water', 'gold', 30),
  a('inrange1', 'balance', 'bronze'),
  a('inrange7', 'balance', 'gold', 7),
  a('rainbow', 'balance', 'silver', 5),
  a('entries100', 'collection', 'bronze', 100),
  a('entries1000', 'collection', 'gold', 1000),
  a('scans50', 'collection', 'silver', 50),
  a('breakfast7', 'habits', 'silver', 7),
  a('connector', 'habits', 'bronze'),
  a('midnight', 'habits', 'bronze')
];

export const ACHIEVEMENT_FAMILIES: readonly AchievementFamily[] = ['first', 'streak', 'weight', 'water', 'balance', 'collection', 'habits'];

export interface AchievementState {
  id: string;
  /** Day it was unlocked (YYYY-MM-DD), or null. */
  at: string | null;
  /** Best so far towards `target` (never goes down when a streak breaks). */
  progress: number;
}

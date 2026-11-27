import type { DBSchema } from 'idb';
import type { ISODate } from '../date';
import type { WeightGoals } from '../nutrition/goals';
import type { MealId, Nutrients, Profile } from '../nutrition/types';

/**
 * Bump DB_VERSION and add a step in `migrations` (db/index.ts) for every
 * structural change. Never edit an existing step: it must stay replayable.
 */
export const DB_NAME = 'myfit';
export const DB_VERSION = 2;

export interface Entry {
  id: string;
  date: ISODate;
  meal: MealId;
  foodId: string;
  name: string;
  brand?: string;
  grams: number;
  /** Snapshot of the food values when logged, so editing a food never rewrites history. */
  per100: Nutrients;
  /** "quick": raw calories typed directly (grams is then 100 and per100 holds the values). */
  kind?: 'quick';
  createdAt: number;
  updatedAt?: number;
}

/** A logged portion, as stored in saved meals and recipes. */
export interface Portion {
  foodId: string;
  name: string;
  brand?: string;
  grams: number;
  per100: Nutrients;
}

export interface Recipe {
  ingredients: Portion[];
  /** Total weight once cooked; defaults to the sum of the ingredients. */
  cookedGrams: number;
  portions?: number;
}

export type FoodSource = 'off' | 'custom';

export interface Food {
  /** "off:<barcode>" for Open Food Facts, "c:<uuid>" for custom foods. */
  id: string;
  source: FoodSource;
  code?: string;
  name: string;
  brand?: string;
  per100: Nutrients;
  servingGrams?: number;
  servingLabel?: string;
  imageUrl?: string;
  favorite?: boolean;
  lastUsedAt?: number;
  lastGrams?: number;
  useCount?: number;
  /** Present when this custom food is a home recipe. */
  recipe?: Recipe;
  createdAt: number;
  updatedAt: number;
}

/** A meal saved as a template, added again in one tap. */
export interface SavedMeal {
  id: string;
  name: string;
  items: Portion[];
  createdAt: number;
  lastUsedAt?: number;
}

export interface WaterLog {
  date: ISODate;
  ml: number;
}

export const MEASURES = ['waist', 'hips', 'chest', 'arm', 'thigh', 'neck'] as const;
export type MeasureKey = (typeof MEASURES)[number];

export interface Measurement extends Partial<Record<MeasureKey, number>> {
  date: ISODate;
  createdAt: number;
}

export interface Photo {
  id: string;
  date: ISODate;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export interface Prefs {
  waterGoalMl: number;
  glassMl: number;
  /** Week (Monday) whose review card was dismissed. */
  reviewDismissed?: ISODate;
  /** Last time the adaptive expenditure was applied automatically. */
  adaptiveAppliedOn?: ISODate;
}

export const DEFAULT_PREFS: Prefs = { waterGoalMl: 2000, glassMl: 250 };

export interface WeightEntry {
  date: ISODate;
  kg: number;
  createdAt: number;
}

export interface SearchCacheItem {
  q: string;
  ts: number;
  items: Food[];
}

export interface MetaMap {
  profile: Profile;
  persisted: boolean;
  goals: WeightGoals;
  prefs: Prefs;
}

export interface MetaRow<K extends keyof MetaMap = keyof MetaMap> {
  key: K;
  value: MetaMap[K];
}

export interface MyFitDB extends DBSchema {
  meta: { key: string; value: MetaRow };
  entries: { key: string; value: Entry; indexes: { 'by-date': string } };
  foods: { key: string; value: Food; indexes: { 'by-code': string } };
  weights: { key: string; value: WeightEntry };
  searchCache: { key: string; value: SearchCacheItem; indexes: { 'by-ts': number } };
  meals: { key: string; value: SavedMeal };
  water: { key: string; value: WaterLog };
  measurements: { key: string; value: Measurement };
  photos: { key: string; value: Photo; indexes: { 'by-date': string } };
}

/** Stores included in the JSON export. Photos stay on the device (too heavy for a backup file). */
export const BACKUP_STORES = ['meta', 'entries', 'foods', 'weights', 'meals', 'water', 'measurements'] as const;
export type BackupStore = (typeof BACKUP_STORES)[number];

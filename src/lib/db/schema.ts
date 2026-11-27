import type { DBSchema } from 'idb';
import type { ISODate } from '../date';
import type { MealId, Nutrients, Profile } from '../nutrition/types';

/**
 * Bump DB_VERSION and add a step in `migrations` (db/index.ts) for every
 * structural change. Never edit an existing step: it must stay replayable.
 */
export const DB_NAME = 'myfit';
export const DB_VERSION = 1;

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
  createdAt: number;
  updatedAt?: number;
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
  createdAt: number;
  updatedAt: number;
}

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
}

export type StoreName = 'meta' | 'entries' | 'foods' | 'weights' | 'searchCache';
export const BACKUP_STORES = ['meta', 'entries', 'foods', 'weights'] as const;
export type BackupStore = (typeof BACKUP_STORES)[number];

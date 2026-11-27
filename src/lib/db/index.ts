import { openDB, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type { ISODate } from '../date';
import {
  BACKUP_STORES,
  DB_NAME,
  DB_VERSION,
  type Entry,
  type Food,
  type MetaMap,
  type MyFitDB,
  type SearchCacheItem,
  type WeightEntry,
} from './schema';

export * from './schema';

type UpgradeTx = IDBPTransaction<MyFitDB, StoreNames<MyFitDB>[], 'versionchange'>;
type Migration = (db: IDBPDatabase<MyFitDB>, tx: UpgradeTx) => void;

/**
 * Ordered migrations. Index i upgrades the database from version i to i + 1.
 * Append only.
 */
export const migrations: Migration[] = [
  // 0 -> 1: initial schema
  (db) => {
    db.createObjectStore('meta', { keyPath: 'key' });
    const entries = db.createObjectStore('entries', { keyPath: 'id' });
    entries.createIndex('by-date', 'date');
    const foods = db.createObjectStore('foods', { keyPath: 'id' });
    foods.createIndex('by-code', 'code');
    db.createObjectStore('weights', { keyPath: 'date' });
    const cache = db.createObjectStore('searchCache', { keyPath: 'q' });
    cache.createIndex('by-ts', 'ts');
  },
];

let dbPromise: Promise<IDBPDatabase<MyFitDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MyFitDB>> {
  dbPromise ??= openDB<MyFitDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      for (let v = oldVersion; v < (newVersion ?? DB_VERSION); v++) migrations[v]?.(db, tx);
    },
    blocking() {
      // Another tab opened a newer version: let it upgrade.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** Test helper: forget the cached connection. */
export async function closeDB(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p).close();
}

// Meta ----------------------------------------------------------------------

export async function getMeta<K extends keyof MetaMap>(key: K): Promise<MetaMap[K] | undefined> {
  const row = await (await getDB()).get('meta', key);
  return row?.value as MetaMap[K] | undefined;
}

export async function setMeta<K extends keyof MetaMap>(key: K, value: MetaMap[K]): Promise<void> {
  await (await getDB()).put('meta', { key, value });
}

// Entries -------------------------------------------------------------------

export async function entriesForDate(date: ISODate): Promise<Entry[]> {
  const list = await (await getDB()).getAllFromIndex('entries', 'by-date', date);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function entriesInRange(from: ISODate, to: ISODate): Promise<Entry[]> {
  return (await getDB()).getAllFromIndex('entries', 'by-date', IDBKeyRange.bound(from, to));
}

export async function putEntries(list: Entry[]): Promise<void> {
  const tx = (await getDB()).transaction('entries', 'readwrite');
  await Promise.all([...list.map((e) => tx.store.put(e)), tx.done]);
}

export async function deleteEntries(ids: string[]): Promise<void> {
  const tx = (await getDB()).transaction('entries', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

// Foods ---------------------------------------------------------------------

export async function getFood(id: string): Promise<Food | undefined> {
  return (await getDB()).get('foods', id);
}

export async function allFoods(): Promise<Food[]> {
  return (await getDB()).getAll('foods');
}

/** Custom foods win over cached Open Food Facts products with the same barcode. */
export async function foodByCode(code: string): Promise<Food | undefined> {
  const list = await (await getDB()).getAllFromIndex('foods', 'by-code', code);
  return list.find((f) => f.source === 'custom') ?? list[0];
}

export async function putFood(food: Food): Promise<void> {
  await (await getDB()).put('foods', food);
}

export async function deleteFood(id: string): Promise<void> {
  await (await getDB()).delete('foods', id);
}

// Weights -------------------------------------------------------------------

export async function allWeights(): Promise<WeightEntry[]> {
  return (await getDB()).getAll('weights'); // keyPath is the date: already sorted
}

export async function putWeight(w: WeightEntry): Promise<void> {
  await (await getDB()).put('weights', w);
}

export async function deleteWeight(date: ISODate): Promise<void> {
  await (await getDB()).delete('weights', date);
}

// Search cache --------------------------------------------------------------

export const SEARCH_TTL_MS = 7 * 24 * 3600 * 1000;
const SEARCH_CACHE_MAX = 200;

export async function getCachedSearch(q: string, now = Date.now()): Promise<SearchCacheItem | undefined> {
  const hit = await (await getDB()).get('searchCache', q);
  return hit && now - hit.ts < SEARCH_TTL_MS ? hit : undefined;
}

export async function putCachedSearch(item: SearchCacheItem): Promise<void> {
  const db = await getDB();
  await db.put('searchCache', item);
  const count = await db.count('searchCache');
  if (count > SEARCH_CACHE_MAX) {
    const tx = db.transaction('searchCache', 'readwrite');
    let cursor = await tx.store.index('by-ts').openCursor();
    let toDelete = count - SEARCH_CACHE_MAX;
    while (cursor && toDelete-- > 0) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

// Whole database --------------------------------------------------------------

export type DumpData = {
  meta: MyFitDB['meta']['value'][];
  entries: Entry[];
  foods: Food[];
  weights: WeightEntry[];
};

export async function dumpAll(): Promise<DumpData> {
  const db = await getDB();
  const tx = db.transaction([...BACKUP_STORES], 'readonly');
  const [meta, entries, foods, weights] = await Promise.all([
    tx.objectStore('meta').getAll(),
    tx.objectStore('entries').getAll(),
    tx.objectStore('foods').getAll(),
    tx.objectStore('weights').getAll(),
  ]);
  await tx.done;
  return { meta, entries, foods, weights };
}

/** Replaces every backed-up store in a single transaction (all or nothing). */
export async function replaceAll(data: DumpData): Promise<void> {
  const db = await getDB();
  const stores = ['meta', 'entries', 'foods', 'weights', 'searchCache'] as const;
  const tx = db.transaction(stores, 'readwrite');
  const ops: Promise<unknown>[] = [];
  for (const name of stores) ops.push(tx.objectStore(name).clear());
  for (const r of data.meta) ops.push(tx.objectStore('meta').put(r));
  for (const r of data.entries) ops.push(tx.objectStore('entries').put(r));
  for (const r of data.foods) ops.push(tx.objectStore('foods').put(r));
  for (const r of data.weights) ops.push(tx.objectStore('weights').put(r));
  await Promise.all([...ops, tx.done]);
}

export async function clearAll(): Promise<void> {
  await replaceAll({ meta: [], entries: [], foods: [], weights: [] });
}

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, parseBackup } from './backup';
import {
  clearAll,
  closeDB,
  dumpAll,
  entriesForDate,
  entriesInRange,
  foodByCode,
  getCachedSearch,
  getMeta,
  putCachedSearch,
  putEntries,
  putFood,
  putWeight,
  replaceAll,
  setMeta,
  allWeights,
  allMeals,
  allMeasurements,
  loggedDates,
  putMeal,
  putMeasurement,
  putWater,
  waterInRange,
} from './index';
import type { Entry, Food } from './schema';

const per100 = { kcal: 100, protein: 5, carbs: 10, fat: 2 };
const entry = (id: string, date: string, createdAt = 0): Entry => ({
  id,
  date,
  meal: 'lunch',
  foodId: 'c:1',
  name: 'Riz',
  grams: 150,
  per100,
  createdAt,
});
const food = (id: string, source: Food['source'], code?: string): Food => ({
  id,
  source,
  code,
  name: id,
  per100,
  createdAt: 0,
  updatedAt: 0,
});

beforeEach(async () => {
  await clearAll();
});

describe('IndexedDB repository', () => {
  it('stores entries by date in creation order', async () => {
    await putEntries([entry('b', '2026-03-01', 2), entry('a', '2026-03-01', 1), entry('c', '2026-03-02')]);
    expect((await entriesForDate('2026-03-01')).map((e) => e.id)).toEqual(['a', 'b']);
    expect(await entriesInRange('2026-03-01', '2026-03-31')).toHaveLength(3);
  });

  it('prefers custom foods for a barcode', async () => {
    await putFood(food('off:123', 'off', '123'));
    await putFood(food('c:x', 'custom', '123'));
    expect((await foodByCode('123'))?.id).toBe('c:x');
  });

  it('keeps meta values', async () => {
    await setMeta('persisted', true);
    expect(await getMeta('persisted')).toBe(true);
  });

  it('expires the search cache', async () => {
    await putCachedSearch({ q: 'skyr', ts: 1000, items: [] });
    expect(await getCachedSearch('skyr', 2000)).toBeTruthy();
    expect(await getCachedSearch('skyr', 1000 + 8 * 24 * 3600 * 1000)).toBeUndefined();
  });

  it('survives a reconnect (data persisted)', async () => {
    await putWeight({ date: '2026-03-01', kg: 80, createdAt: 0 });
    await closeDB();
    expect(await allWeights()).toHaveLength(1);
  });
});

describe('backup round trip', () => {
  it('exports then imports everything', async () => {
    await putEntries([entry('a', '2026-03-01')]);
    await putFood(food('c:1', 'custom'));
    await putWeight({ date: '2026-03-01', kg: 80, createdAt: 0 });
    const json = JSON.parse(JSON.stringify(buildBackup(await dumpAll(), 'dark')));
    await clearAll();
    const { backup, skipped } = parseBackup(json);
    expect(skipped).toBe(0);
    expect(backup.theme).toBe('dark');
    await replaceAll(backup.data);
    const after = await dumpAll();
    expect(after.entries).toHaveLength(1);
    expect(after.foods).toHaveLength(1);
    expect(after.weights).toHaveLength(1);
  });

  it('rejects foreign files and newer versions', () => {
    expect(() => parseBackup({ hello: 1 })).toThrow(/pas une sauvegarde/);
    expect(() => parseBackup({ format: 'myfit-backup', schemaVersion: 999, data: {} })).toThrow(/plus récente/);
  });

  it('skips invalid rows', () => {
    const { backup, skipped } = parseBackup({
      format: 'myfit-backup',
      schemaVersion: 1,
      data: { entries: [entry('a', '2026-03-01'), { id: 'bad' }], weights: [{ date: 'x', kg: 1 }] },
    });
    expect(backup.data.entries).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe('schema v2', () => {
  it('upgrades a version 1 database without losing data', async () => {
    await closeDB();
    const { openDB, deleteDB } = await import('idb');
    await deleteDB('myfit');
    // Build a v1 database exactly as the first release did.
    const v1 = await openDB('myfit', 1, {
      upgrade(db) {
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('entries', { keyPath: 'id' }).createIndex('by-date', 'date');
        db.createObjectStore('foods', { keyPath: 'id' }).createIndex('by-code', 'code');
        db.createObjectStore('weights', { keyPath: 'date' });
        db.createObjectStore('searchCache', { keyPath: 'q' }).createIndex('by-ts', 'ts');
      },
    });
    await v1.put('weights', { date: '2026-01-01', kg: 81, createdAt: 0 });
    await v1.put('entries', entry('old', '2026-01-01'));
    v1.close();

    expect(await allWeights()).toEqual([{ date: '2026-01-01', kg: 81, createdAt: 0 }]);
    expect(await entriesForDate('2026-01-01')).toHaveLength(1);
    await putWater({ date: '2026-01-01', ml: 750 });
    await putMeal({ id: 'm1', name: 'Petit-déj', items: [], createdAt: 0 });
    await putMeasurement({ date: '2026-01-01', waist: 85, createdAt: 0 });
    expect(await waterInRange('2026-01-01', '2026-01-31')).toHaveLength(1);
    expect(await allMeals()).toHaveLength(1);
    expect(await allMeasurements()).toHaveLength(1);
  });

  it('lists logged days from the index only', async () => {
    await putEntries([entry('a', '2026-03-01'), entry('b', '2026-03-01'), entry('c', '2026-03-03')]);
    expect([...(await loggedDates('2026-03-01', '2026-03-31'))]).toEqual(['2026-03-01', '2026-03-03']);
  });

  it('imports a version 1 backup', () => {
    const { backup } = parseBackup({
      format: 'myfit-backup',
      schemaVersion: 1,
      data: { meta: [], entries: [entry('a', '2026-03-01')], foods: [], weights: [] },
    });
    expect(backup.schemaVersion).toBe(2);
    expect(backup.data.meals).toEqual([]);
    expect(backup.data.water).toEqual([]);
  });
});

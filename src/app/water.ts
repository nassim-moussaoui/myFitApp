/** Water and preferences: used by the journal, kept out of the heavier feature chunks. */
import * as db from '../lib/db';
import type { Prefs } from '../lib/db/schema';
import type { ISODate } from '../lib/date';
import { persist } from './actions';
import { store } from './store';

// Preferences -------------------------------------------------------------------

export function savePrefs(patch: Partial<Prefs>): void {
  const prefs = { ...store.get().prefs, ...patch };
  store.set({ prefs });
  persist(db.setMeta('prefs', prefs));
}

// Water -------------------------------------------------------------------------

export async function ensureWater(date: ISODate): Promise<number> {
  const cached = store.get().water[date];
  if (cached != null) return cached;
  const rows = await db.waterInRange(date, date).catch(() => []);
  const ml = rows[0]?.ml ?? 0;
  store.set((s) => ({ water: { ...s.water, [date]: s.water[date] ?? ml } }));
  return ml;
}

export function addWater(date: ISODate, deltaMl: number): void {
  const ml = Math.max(0, Math.min(10_000, (store.get().water[date] ?? 0) + deltaMl));
  store.set((s) => ({ water: { ...s.water, [date]: ml } }));
  persist(db.putWater({ date, ml }));
}


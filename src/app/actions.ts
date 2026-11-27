import * as db from '../lib/db';
import type { Entry, Food, WeightEntry } from '../lib/db/schema';
import { addDays, todayISO, type ISODate } from '../lib/date';
import type { MealId, Profile } from '../lib/nutrition/types';
import { showToast, store } from './store';

const SAVE_ERROR = "Impossible d'enregistrer sur l'appareil. Réessaie.";

/** Fire-and-forget persistence: the UI is already updated. */
function persist(p: Promise<unknown>): void {
  p.catch((e) => {
    console.error(e);
    showToast(SAVE_ERROR);
  });
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const newId = uid;

export async function initApp(): Promise<void> {
  try {
    const today = store.get().today;
    const [profile, entries] = await Promise.all([db.getMeta('profile'), db.entriesForDate(today)]);
    store.set((s) => ({ ready: true, profile: profile ?? null, days: { ...s.days, [today]: entries } }));
  } catch (e) {
    console.error(e);
    store.set({ ready: true });
    showToast("Le stockage local est indisponible. Vérifie que la navigation privée est désactivée.");
  }
  void requestPersistence();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshToday();
  });
}

/** Ask the browser to keep our data (no eviction under storage pressure). */
async function requestPersistence(): Promise<void> {
  const storage = navigator.storage;
  if (!storage?.persist) return;
  try {
    let ok = await storage.persisted();
    if (!ok) ok = await storage.persist();
    store.set({ persisted: ok });
    void db.setMeta('persisted', ok).catch(() => {});
  } catch {
    /* not supported */
  }
}

/** Handles the app being reopened on a new day. */
export function refreshToday(): void {
  const now = todayISO();
  const s = store.get();
  if (now === s.today) return;
  store.set({ today: now, date: s.date === s.today ? now : s.date });
  void ensureDay(store.get().date);
}

// Journal ---------------------------------------------------------------------

export async function ensureDay(date: ISODate): Promise<Entry[]> {
  const cached = store.get().days[date];
  if (cached) return cached;
  const list = await db.entriesForDate(date).catch(() => [] as Entry[]);
  store.set((s) => ({ days: { ...s.days, [date]: s.days[date] ?? list } }));
  return store.get().days[date] ?? list;
}

export function setDate(date: ISODate): void {
  store.set({ date });
  void ensureDay(date);
  // Warm the neighbours so swiping feels instant.
  void ensureDay(addDays(date, -1));
  void ensureDay(addDays(date, 1));
}

function setDay(date: ISODate, update: (list: Entry[]) => Entry[]): void {
  store.set((s) => ({ days: { ...s.days, [date]: update(s.days[date] ?? []) } }));
}

/** Records that a food was used, for "Récents" and the default quantity. */
function touchFood(food: Food, grams: number): Food {
  const updated: Food = {
    ...food,
    lastUsedAt: Date.now(),
    lastGrams: grams,
    useCount: (food.useCount ?? 0) + 1,
    updatedAt: Date.now(),
  };
  persist(db.putFood(updated));
  return updated;
}

export function addEntry(food: Food, grams: number, meal: MealId, date: ISODate): { entry: Entry; food: Food } {
  const entry: Entry = {
    id: uid(),
    date,
    meal,
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    grams,
    per100: food.per100,
    createdAt: Date.now(),
  };
  setDay(date, (l) => [...l, entry]);
  persist(db.putEntries([entry]));
  return { entry, food: touchFood(food, grams) };
}

export function updateEntry(entry: Entry, patch: Partial<Pick<Entry, 'grams' | 'meal'>>): void {
  const next: Entry = { ...entry, ...patch, updatedAt: Date.now() };
  setDay(entry.date, (l) => l.map((e) => (e.id === entry.id ? next : e)));
  persist(db.putEntries([next]));
}

export function removeEntry(entry: Entry, silent = false): void {
  setDay(entry.date, (l) => l.filter((e) => e.id !== entry.id));
  persist(db.deleteEntries([entry.id]));
  if (silent) return;
  showToast(`${entry.name} supprimé.`, {
    label: 'Annuler',
    run: () => {
      setDay(entry.date, (l) => [...l, entry].sort((a, b) => a.createdAt - b.createdAt));
      persist(db.putEntries([entry]));
    },
  });
}

export async function copyMeal(from: ISODate, to: ISODate, meal: MealId): Promise<void> {
  const source = (await ensureDay(from)).filter((e) => e.meal === meal);
  if (!source.length) return;
  const now = Date.now();
  const copies = source.map((e, i) => ({
    ...e,
    id: uid(),
    date: to,
    createdAt: now + i,
    updatedAt: undefined,
  }));
  await ensureDay(to);
  setDay(to, (l) => [...l, ...copies]);
  persist(db.putEntries(copies));
  const ids = copies.map((c) => c.id);
  showToast(`${copies.length} aliment${copies.length > 1 ? 's' : ''} copié${copies.length > 1 ? 's' : ''}.`, {
    label: 'Annuler',
    run: () => {
      setDay(to, (l) => l.filter((e) => !ids.includes(e.id)));
      persist(db.deleteEntries(ids));
    },
  });
}

// Foods ---------------------------------------------------------------------

export function saveFood(food: Food): void {
  persist(db.putFood({ ...food, updatedAt: Date.now() }));
}

// Profile ---------------------------------------------------------------------

export function saveProfile(profile: Profile): void {
  const p = { ...profile, updatedAt: Date.now() };
  store.set({ profile: p });
  persist(db.setMeta('profile', p));
}

// Weight ----------------------------------------------------------------------

export async function ensureWeights(): Promise<WeightEntry[]> {
  const cached = store.get().weights;
  if (cached) return cached;
  const list = await db.allWeights().catch(() => [] as WeightEntry[]);
  store.set({ weights: list });
  return list;
}

const byDate = (a: WeightEntry, b: WeightEntry) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function saveWeight(date: ISODate, kg: number): void {
  const w: WeightEntry = { date, kg, createdAt: Date.now() };
  store.set((s) => ({ weights: [...(s.weights ?? []).filter((x) => x.date !== date), w].sort(byDate) }));
  persist(db.putWeight(w));
}

export function removeWeight(w: WeightEntry): void {
  store.set((s) => ({ weights: (s.weights ?? []).filter((x) => x.date !== w.date) }));
  persist(db.deleteWeight(w.date));
  showToast('Pesée supprimée.', {
    label: 'Annuler',
    run: () => {
      store.set((s) => ({ weights: [...(s.weights ?? []), w].sort(byDate) }));
      persist(db.putWeight(w));
    },
  });
}

// Data ------------------------------------------------------------------------

export async function resetLoadedState(): Promise<void> {
  const today = todayISO();
  store.set({ days: {}, weights: null, today, date: today, overlay: null });
  const [profile, entries] = await Promise.all([db.getMeta('profile'), db.entriesForDate(today)]);
  store.set((s) => ({ profile: profile ?? null, days: { ...s.days, [today]: entries } }));
}

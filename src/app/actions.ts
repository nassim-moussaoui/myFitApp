import * as db from '../lib/db';
import { DEFAULT_PREFS, type Entry, type Food, type WeightEntry } from '../lib/db/schema';
import { addDays, todayISO, type ISODate } from '../lib/date';
import { fmtKg } from '../lib/format';
import {
  DEFAULT_GOALS,
  advanceGoals,
  isGoals,
  plannedWeeklyRate,
  type AdvanceResult,
  type WeightGoals,
} from '../lib/nutrition/goals';
import type { MealId, Profile } from '../lib/nutrition/types';
import { showToast, store } from './store';

const SAVE_ERROR = "Impossible d'enregistrer sur l'appareil. Réessaie.";

/** Fire-and-forget persistence: the UI is already updated. */
export function persist(p: Promise<unknown>): void {
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
    const [profile, entries, prefs, water] = await Promise.all([
      db.getMeta('profile'),
      db.entriesForDate(today),
      db.getMeta('prefs').catch(() => undefined),
      db.waterInRange(today, today).catch(() => []),
    ]);
    store.set((s) => ({
      ready: true,
      profile: profile ?? null,
      days: { ...s.days, [today]: entries },
      prefs: { ...DEFAULT_PREFS, ...prefs },
      water: { ...s.water, [today]: water[0]?.ml ?? 0 },
    }));
    void loadLogged();
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

/** Updates a day's entries in memory and keeps the logged-days set (streak) in sync. */
export function setDay(date: ISODate, update: (list: Entry[]) => Entry[]): void {
  store.set((s) => {
    const list = update(s.days[date] ?? []);
    let logged = s.logged;
    if (logged && list.length > 0 !== logged.has(date)) {
      logged = new Set(logged);
      if (list.length) logged.add(date);
      else logged.delete(date);
    }
    return { days: { ...s.days, [date]: list }, logged };
  });
}

/** Logged days over the last 400 days, for the streak. */
export async function loadLogged(): Promise<void> {
  const today = store.get().today;
  const set = await db.loggedDates(addDays(today, -400), today).catch(() => new Set<ISODate>());
  store.set((s) => {
    // Merge with anything added in memory meanwhile.
    for (const [d, l] of Object.entries(s.days)) if (l.length) set.add(d);
    return { logged: set };
  });
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

export function updateEntry(entry: Entry, patch: Partial<Pick<Entry, 'grams' | 'meal' | 'name' | 'per100'>>): void {
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
  // A new goal or rate may change the direction of the current milestone.
  syncGoals();
}

// Weight ----------------------------------------------------------------------

export async function ensureWeights(): Promise<WeightEntry[]> {
  const cached = store.get().weights;
  if (cached) return cached;
  const [list, goals] = await Promise.all([
    db.allWeights().catch(() => [] as WeightEntry[]),
    db.getMeta('goals').catch(() => undefined),
  ]);
  store.set({ weights: list, goals: isGoals(goals) ? { ...DEFAULT_GOALS, ...goals } : DEFAULT_GOALS });
  syncGoals();
  return list;
}

// Weight milestones -------------------------------------------------------------

/**
 * Updates milestones from the latest weigh-in (or the profile weight when there is none):
 * validates a reached milestone and starts the next one right away.
 */
export function syncGoals(): AdvanceResult | null {
  const s = store.get();
  if (!s.profile || !s.weights || !s.goals) return null;
  const last = s.weights[s.weights.length - 1];
  const latest = last ? { date: last.date, kg: last.kg } : { date: s.today, kg: s.profile.weightKg };
  const r = advanceGoals(s.goals, latest, plannedWeeklyRate(s.profile, s.today));
  if (r.goals !== s.goals) saveGoals(r.goals);
  return r;
}

export function saveGoals(goals: WeightGoals): void {
  store.set({ goals });
  persist(db.setMeta('goals', goals));
}

export function milestoneToast(r: AdvanceResult | null): string | null {
  if (!r) return null;
  if (r.finalJustReached) return 'Objectif final atteint, bravo !';
  if (r.reached) {
    const next = r.goals.current;
    return next ? `Palier atteint ! Prochain : ${fmtKg(next.targetKg)} kg` : 'Palier atteint, bravo !';
  }
  return null;
}

const byDate = (a: WeightEntry, b: WeightEntry) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Saves a weigh-in and returns what happened to the milestones. */
export function saveWeight(date: ISODate, kg: number): AdvanceResult | null {
  const w: WeightEntry = { date, kg, createdAt: Date.now() };
  store.set((s) => ({ weights: [...(s.weights ?? []).filter((x) => x.date !== date), w].sort(byDate) }));
  persist(db.putWeight(w));
  return syncGoals();
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
  store.set({
    days: {},
    weights: null,
    goals: null,
    water: {},
    logged: null,
    meals: null,
    measurements: null,
    photos: null,
    adaptive: null,
    today,
    date: today,
    overlay: null,
  });
  const [profile, entries, prefs] = await Promise.all([
    db.getMeta('profile'),
    db.entriesForDate(today),
    db.getMeta('prefs').catch(() => undefined),
  ]);
  store.set((s) => ({
    profile: profile ?? null,
    days: { ...s.days, [today]: entries },
    prefs: { ...DEFAULT_PREFS, ...prefs },
  }));
  void loadLogged();
}

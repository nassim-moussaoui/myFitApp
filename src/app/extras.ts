/** Saved meals, quick add, body measurements and progress photos (loaded with the screens that use them). */
import * as db from '../lib/db';
import type { Entry, Measurement, Photo, Portion, SavedMeal } from '../lib/db/schema';
import type { ISODate } from '../lib/date';
import type { MealId } from '../lib/nutrition/types';
import { ensureDay, newId, persist, setDay } from './actions';
import { showToast, store } from './store';

// Quick add ---------------------------------------------------------------------

export interface QuickValues {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Raw calories without a food: stored as a 100 g portion whose per-100 values are the totals. */
export function addQuickEntry(v: QuickValues, meal: MealId, date: ISODate): Entry {
  const entry: Entry = {
    id: newId(),
    date,
    meal,
    foodId: 'quick',
    name: v.name.trim() || 'Ajout rapide',
    grams: 100,
    per100: { kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat },
    kind: 'quick',
    createdAt: Date.now(),
  };
  setDay(date, (l) => [...l, entry]);
  persist(db.putEntries([entry]));
  return entry;
}

// Saved meals -------------------------------------------------------------------

export async function ensureMeals(): Promise<SavedMeal[]> {
  const cached = store.get().meals;
  if (cached) return cached;
  const list = await db.allMeals().catch(() => [] as SavedMeal[]);
  store.set({ meals: list });
  return list;
}

export const toPortion = (e: Pick<Entry, 'foodId' | 'name' | 'brand' | 'grams' | 'per100'>): Portion => ({
  foodId: e.foodId,
  name: e.name,
  brand: e.brand,
  grams: e.grams,
  per100: e.per100,
});

export function saveMeal(name: string, items: Portion[]): SavedMeal {
  const meal: SavedMeal = { id: newId(), name: name.trim(), items, createdAt: Date.now() };
  store.set((s) => ({ meals: [...(s.meals ?? []), meal] }));
  persist(db.putMeal(meal));
  return meal;
}

export function deleteMeal(meal: SavedMeal): void {
  store.set((s) => ({ meals: (s.meals ?? []).filter((m) => m.id !== meal.id) }));
  persist(db.deleteMeal(meal.id));
  showToast(`Repas « ${meal.name} » supprimé`, {
    label: 'Annuler',
    run: () => {
      store.set((s) => ({ meals: [...(s.meals ?? []), meal] }));
      persist(db.putMeal(meal));
    },
  });
}

/** Logs every item of a saved meal (one undo for the whole meal). */
export async function addSavedMeal(meal: SavedMeal, mealId: MealId, date: ISODate): Promise<void> {
  await ensureDay(date);
  const now = Date.now();
  const entries: Entry[] = meal.items.map((it, i) => ({
    id: newId(),
    date,
    meal: mealId,
    foodId: it.foodId,
    name: it.name,
    brand: it.brand,
    grams: it.grams,
    per100: it.per100,
    ...(it.foodId === 'quick' ? { kind: 'quick' as const } : {}),
    createdAt: now + i,
  }));
  setDay(date, (l) => [...l, ...entries]);
  persist(db.putEntries(entries));
  const used = { ...meal, lastUsedAt: now };
  store.set((s) => ({ meals: (s.meals ?? []).map((m) => (m.id === meal.id ? used : m)) }));
  persist(db.putMeal(used));
  const ids = entries.map((e) => e.id);
  showToast(`${meal.name} ajouté`, {
    label: 'Annuler',
    run: () => {
      setDay(date, (l) => l.filter((e) => !ids.includes(e.id)));
      persist(db.deleteEntries(ids));
    },
  });
}

// Body measurements -------------------------------------------------------------

export async function ensureMeasurements(): Promise<Measurement[]> {
  const cached = store.get().measurements;
  if (cached) return cached;
  const list = await db.allMeasurements().catch(() => [] as Measurement[]);
  store.set({ measurements: list });
  return list;
}

export function saveMeasurement(m: Measurement): void {
  store.set((s) => ({
    measurements: [...(s.measurements ?? []).filter((x) => x.date !== m.date), m].sort((a, b) =>
      a.date < b.date ? -1 : 1,
    ),
  }));
  persist(db.putMeasurement(m));
}

export function removeMeasurement(m: Measurement): void {
  store.set((s) => ({ measurements: (s.measurements ?? []).filter((x) => x.date !== m.date) }));
  persist(db.deleteMeasurement(m.date));
}

// Progress photos ---------------------------------------------------------------

export async function ensurePhotos(): Promise<Photo[]> {
  const cached = store.get().photos;
  if (cached) return cached;
  const list = await db.allPhotos().catch(() => [] as Photo[]);
  store.set({ photos: list });
  return list;
}

/** Downscales a picture to 1440 px max (JPEG) so photos stay light on the device. */
async function shrink(file: Blob, max = 1440): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('encode');
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function addPhoto(file: File, date: ISODate): Promise<boolean> {
  try {
    const { blob, width, height } = await shrink(file);
    const photo: Photo = { id: newId(), date, blob, width, height, createdAt: Date.now() };
    await ensurePhotos();
    store.set((s) => ({
      photos: [...(s.photos ?? []), photo].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt)),
    }));
    await db.putPhoto(photo);
    return true;
  } catch (e) {
    console.error(e);
    showToast("Impossible d'enregistrer cette photo.");
    return false;
  }
}

export function removePhoto(p: Photo): void {
  store.set((s) => ({ photos: (s.photos ?? []).filter((x) => x.id !== p.id) }));
  persist(db.deletePhoto(p.id));
}


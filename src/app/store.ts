import { useLayoutEffect, useReducer, useRef } from 'preact/hooks';
import {
  DEFAULT_PREFS,
  type Entry,
  type Measurement,
  type Photo,
  type Prefs,
  type SavedMeal,
  type WeightEntry,
} from '../lib/db/schema';
import type { AdaptiveResult } from '../lib/nutrition/adaptive';
import { todayISO, type ISODate } from '../lib/date';
import type { WeightGoals } from '../lib/nutrition/goals';
import type { MealId, Profile } from '../lib/nutrition/types';

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export type Overlay =
  | { kind: 'add'; meal: MealId; date: ISODate }
  | { kind: 'entry'; entry: Entry }
  | { kind: 'save-meal'; meal: MealId; date: ISODate }
  | null;

export interface AppState {
  ready: boolean;
  profile: Profile | null;
  today: ISODate;
  /** Day shown in the journal. */
  date: ISODate;
  days: Record<ISODate, Entry[]>;
  weights: WeightEntry[] | null;
  /** Weight milestones, loaded with the weights. */
  goals: WeightGoals | null;
  prefs: Prefs;
  /** Water in ml per loaded day. */
  water: Record<ISODate, number>;
  /** Days with at least one entry (for the streak). */
  logged: Set<ISODate> | null;
  meals: SavedMeal[] | null;
  measurements: Measurement[] | null;
  photos: Photo[] | null;
  /** Latest real-expenditure estimate. */
  adaptive: AdaptiveResult | null;
  overlay: Overlay;
  toast: Toast | null;
  /** Set when a new service worker is waiting. Calling it activates it and reloads. */
  applyUpdate: (() => void) | null;
  persisted: boolean | null;
}

type Listener = () => void;

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

const today = todayISO();

export const store = createStore<AppState>({
  ready: false,
  profile: null,
  today,
  date: today,
  days: {},
  weights: null,
  goals: null,
  prefs: DEFAULT_PREFS,
  water: {},
  logged: null,
  meals: null,
  measurements: null,
  photos: null,
  adaptive: null,
  overlay: null,
  toast: null,
  applyUpdate: null,
  persisted: null,
});

/** Subscribes to a slice of the store; re-renders only when the slice changes (Object.is). */
export function useStore<S>(selector: (s: AppState) => S): S {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const selRef = useRef(selector);
  selRef.current = selector;
  const value = selector(store.get());
  const valueRef = useRef(value);
  valueRef.current = value;
  useLayoutEffect(() => {
    const check = () => {
      if (!Object.is(selRef.current(store.get()), valueRef.current)) force(0);
    };
    const unsubscribe = store.subscribe(check);
    // The store may have changed between render and subscription (e.g. IndexedDB
    // answered before effects ran): catch up now instead of missing the update.
    check();
    return unsubscribe;
  }, []);
  return value;
}

let toastId = 0;
export function showToast(text: string, action?: Toast['action']): void {
  store.set({ toast: { id: ++toastId, text, action } });
}

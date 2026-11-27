import type { Nutrients } from './types';

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

const OPTIONAL = ['sugars', 'fiber', 'salt'] as const;

/** Nutrients for `grams` of a food given its values per 100 g. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const f = Math.max(0, grams) / 100;
  const out: Nutrients = {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    carbs: per100.carbs * f,
    fat: per100.fat * f,
  };
  for (const k of OPTIONAL) {
    const v = per100[k];
    if (v != null) out[k] = v * f;
  }
  return out;
}

export function sumNutrients(list: Iterable<Nutrients>): Nutrients {
  const out: Nutrients = { ...ZERO };
  for (const n of list) {
    out.kcal += n.kcal;
    out.protein += n.protein;
    out.carbs += n.carbs;
    out.fat += n.fat;
    for (const k of OPTIONAL) {
      const v = n[k];
      if (v != null) out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export interface Portion {
  grams: number;
  per100: Nutrients;
}

export const totalOf = (items: Iterable<Portion>): Nutrients => {
  const scaled: Nutrients[] = [];
  for (const i of items) scaled.push(scaleNutrients(i.per100, i.grams));
  return sumNutrients(scaled);
};

/** Validates per-100 g values: finite, non-negative and physically plausible. */
export function isPlausiblePer100(n: Partial<Nutrients>): n is Nutrients {
  const vals = [n.kcal, n.protein, n.carbs, n.fat];
  if (vals.some((v) => v == null || !Number.isFinite(v) || v < 0)) return false;
  if ((n.kcal ?? 0) > 950) return false;
  return (n.protein ?? 0) + (n.carbs ?? 0) + (n.fat ?? 0) <= 101;
}

/** Per-100 g values of a home recipe: total of the ingredients spread over the cooked weight. */
export function recipePer100(ingredients: Iterable<Portion>, cookedGrams: number): Nutrients {
  const total = totalOf(ingredients);
  if (cookedGrams <= 0) return { ...ZERO };
  const f = 100 / cookedGrams;
  const r = (n: number, d = 1) => Math.round(n * f * 10 ** d) / 10 ** d;
  const out: Nutrients = { kcal: r(total.kcal, 0), protein: r(total.protein), carbs: r(total.carbs), fat: r(total.fat) };
  for (const k of OPTIONAL) {
    const v = total[k];
    if (v != null) out[k] = r(v, k === 'salt' ? 2 : 1);
  }
  return out;
}

export type Micro = 'fiber' | 'sugars' | 'salt';

export interface MicroTotal {
  value: number;
  /** True when every logged food had this value (otherwise the total is a minimum). */
  complete: boolean;
}

/** Daily fibre, sugars and salt, flagging totals built from incomplete data. */
export function microTotals(items: Iterable<Portion>): Record<Micro, MicroTotal> {
  const out: Record<Micro, MicroTotal> = {
    fiber: { value: 0, complete: true },
    sugars: { value: 0, complete: true },
    salt: { value: 0, complete: true },
  };
  for (const i of items) {
    for (const k of ['fiber', 'sugars', 'salt'] as const) {
      const v = i.per100[k];
      if (v == null) out[k].complete = false;
      else out[k].value += (v * Math.max(0, i.grams)) / 100;
    }
  }
  return out;
}

/** Reference values: fibre at least 30 g (ANSES), salt at most 5 g and free sugars at most 50 g (WHO). */
export const MICRO_REF: Record<Micro, { label: string; ref: number; kind: 'min' | 'max' }> = {
  fiber: { label: 'Fibres', ref: 30, kind: 'min' },
  sugars: { label: 'Sucres', ref: 50, kind: 'max' },
  salt: { label: 'Sel', ref: 5, kind: 'max' },
};

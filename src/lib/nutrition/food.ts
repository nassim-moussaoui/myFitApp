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

import { describe, expect, it } from 'vitest';
import { isPlausiblePer100, scaleNutrients, sumNutrients, totalOf } from './food';

describe('scaleNutrients', () => {
  it('scales per-100 g values to a portion', () => {
    const r = scaleNutrients({ kcal: 57, protein: 9.5, carbs: 3.6, fat: 0.5, sugars: 3.6 }, 150);
    expect(r.kcal).toBeCloseTo(85.5);
    expect(r.protein).toBeCloseTo(14.25);
    expect(r.sugars).toBeCloseTo(5.4);
    expect(r.fiber).toBeUndefined();
  });
  it('treats negative grams as zero', () => {
    expect(scaleNutrients({ kcal: 100, protein: 1, carbs: 1, fat: 1 }, -5).kcal).toBe(0);
  });
});

describe('sumNutrients', () => {
  it('sums core and optional values', () => {
    const s = sumNutrients([
      { kcal: 100, protein: 10, carbs: 5, fat: 2, fiber: 1 },
      { kcal: 50, protein: 1, carbs: 10, fat: 0 },
    ]);
    expect(s).toEqual({ kcal: 150, protein: 11, carbs: 15, fat: 2, fiber: 1 });
  });
  it('returns zeros for an empty list', () => {
    expect(sumNutrients([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

it('totalOf sums portions', () => {
  const t = totalOf([
    { grams: 200, per100: { kcal: 100, protein: 10, carbs: 0, fat: 5 } },
    { grams: 50, per100: { kcal: 400, protein: 0, carbs: 100, fat: 0 } },
  ]);
  expect(t.kcal).toBe(400);
  expect(t.protein).toBe(20);
  expect(t.carbs).toBe(50);
});

describe('isPlausiblePer100', () => {
  it('accepts normal values', () => {
    expect(isPlausiblePer100({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 })).toBe(true);
  });
  it('rejects impossible values', () => {
    expect(isPlausiblePer100({ kcal: 1200, protein: 0, carbs: 0, fat: 100 })).toBe(false);
    expect(isPlausiblePer100({ kcal: 100, protein: 60, carbs: 60, fat: 0 })).toBe(false);
    expect(isPlausiblePer100({ kcal: 100, protein: -1, carbs: 0, fat: 0 })).toBe(false);
    expect(isPlausiblePer100({ kcal: 100, protein: 1, carbs: 1 })).toBe(false);
  });
});

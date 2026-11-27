import { describe, expect, it } from 'vitest';
import { addDays } from '../date';
import { estimateTdee } from './adaptive';
import { microTotals, recipePer100 } from './food';
import { computeTargets } from './targets';
import type { Profile } from './types';
import { weekReview, weekStart } from './weekly';

const END = '2026-03-28';

/** n logged days at `kcal`, and weigh-ins every other day losing `kgPerWeek`. */
function data(days: number, kcal: number, kgPerWeek: number, weighEvery = 2) {
  const dailyKcal = new Map<string, number>();
  const weights: { date: string; kg: number }[] = [];
  for (let i = 0; i < 28; i++) {
    const d = addDays(END, -27 + i);
    if (i >= 28 - days) dailyKcal.set(d, kcal);
    if (i % weighEvery === 0) weights.push({ date: d, kg: 80 + (kgPerWeek / 7) * i });
  }
  return { dailyKcal, weights };
}

describe('estimateTdee', () => {
  it('finds expenditure from intake and weight loss', () => {
    // 2000 kcal/day while losing 0.5 kg/week => 2000 + 550 = 2550 kcal
    const r = estimateTdee({ ...data(28, 2000, -0.5), end: END, formulaTdee: 2550, targetKcal: 2000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estimate.raw).toBeCloseTo(2550, -1);
    expect(r.estimate.weeklyChange).toBeCloseTo(-0.5, 1);
    expect(r.estimate.confidence).toBe('high');
  });
  it('blends toward the formula when the data disagrees', () => {
    // Data says 2550 but the formula says 2800: high confidence keeps 85 % of the data.
    const r = estimateTdee({ ...data(28, 2000, -0.5), end: END, formulaTdee: 2800, targetKcal: 2000 });
    if (!r.ok) throw new Error('expected estimate');
    expect(r.estimate.tdee).toBe(Math.round((0.85 * r.estimate.raw + 0.15 * 2800) / 10) * 10);
    expect(r.estimate.formula).toBe(2800);
  });
  it('ignores partially logged days', () => {
    const d = data(28, 2000, -0.5);
    for (const k of [...d.dailyKcal.keys()].slice(0, 5)) d.dailyKcal.set(k, 300);
    const r = estimateTdee({ ...d, end: END, formulaTdee: 2550, targetKcal: 2000 });
    if (!r.ok) throw new Error('expected estimate');
    expect(r.estimate.loggedDays).toBe(23);
    expect(r.estimate.avgIntake).toBe(2000);
  });
  it('asks for more meals or more weigh-ins', () => {
    const few = estimateTdee({ ...data(6, 2000, -0.5), end: END, formulaTdee: 2550, targetKcal: 2000 });
    expect(few.ok).toBe(false);
    if (!few.ok) expect(few.reason).toMatch(/repas/);
    const noWeights = estimateTdee({ ...data(28, 2000, -0.5, 30), end: END, formulaTdee: 2550, targetKcal: 2000 });
    expect(noWeights.ok).toBe(false);
    if (!noWeights.ok) expect(noWeights.reason).toMatch(/Pèse-toi/);
  });
  it('clamps absurd values', () => {
    const r = estimateTdee({ ...data(28, 6000, -0.5), end: END, formulaTdee: 2500, targetKcal: 2000 });
    if (!r.ok) throw new Error('expected estimate');
    expect(r.estimate.raw).toBe(3250);
  });
});

describe('adaptive targets', () => {
  const p: Profile = {
    sex: 'male',
    age: 30,
    ageRecordedOn: '2026-01-01',
    heightCm: 180,
    weightKg: 80,
    activity: 'moderate',
    goal: 'lose',
    rateKgPerWeek: 0.5,
    proteinPerKg: 1.8,
    fatPerKg: 0.8,
    override: null,
    updatedAt: 0,
  };
  it('uses the measured expenditure only when adaptive mode is on', () => {
    const measured = { ...p, adaptiveTdee: { kcal: 2500, on: '2026-03-01' } };
    expect(computeTargets(measured, '2026-03-02').tdee).toBe(2759);
    const on = computeTargets({ ...measured, adaptive: true }, '2026-03-02');
    expect(on.tdee).toBe(2500);
    expect(on.formulaTdee).toBe(2759);
    expect(on.kcal).toBe(1950);
    expect(on.adaptive).toBe(true);
  });
});

describe('weekReview', () => {
  const targets = { kcal: 2000, protein: 140, carbs: 200, fat: 60 };
  const start = '2026-03-02';
  const totals = new Map(
    Array.from({ length: 6 }, (_, i) => [
      addDays(start, i),
      { kcal: i === 0 ? 2500 : 1950, protein: i < 5 ? 150 : 90, carbs: 0, fat: 0 },
    ]),
  );
  const weights = [
    { date: '2026-02-24', kg: 80.4 },
    { date: '2026-02-27', kg: 80.2 },
    { date: '2026-03-03', kg: 79.9 },
    { date: '2026-03-06', kg: 79.7 },
  ];
  const r = weekReview({ start, totals, weights, water: new Map([[start, 1500]]), targets, direction: -1 });
  it('summarises the week', () => {
    expect(r.end).toBe('2026-03-08');
    expect(r.daysLogged).toBe(6);
    expect(r.daysOnTarget).toBe(5);
    expect(r.proteinDays).toBe(5);
    expect(r.weightChange).toBe(-0.5);
    expect(r.waterAvgMl).toBe(1500);
  });
  it('writes encouraging highlights', () => {
    expect(r.highlights[0]).toMatch(/6 jours/);
    expect(r.highlights[1]).toMatch(/baisse de 0,5 kg/);
  });
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-03-08')).toBe('2026-03-02');
    expect(weekStart('2026-03-02')).toBe('2026-03-02');
  });
});

describe('recipes and micros', () => {
  const rice = { grams: 200, per100: { kcal: 350, protein: 7, carbs: 78, fat: 1, fiber: 1 } };
  const chicken = { grams: 300, per100: { kcal: 120, protein: 23, carbs: 0, fat: 2.5, fiber: 0, salt: 0.2 } };
  it('spreads the ingredients over the cooked weight', () => {
    // Raw total 1060 kcal; rice absorbs water: 900 g cooked.
    const r = recipePer100([rice, chicken], 900);
    expect(r.kcal).toBe(118);
    expect(r.protein).toBeCloseTo((14 + 69) / 9, 1);
    expect(r.fiber).toBeCloseTo(2 / 9, 1);
  });
  it('flags incomplete micro totals', () => {
    const m = microTotals([rice, chicken]);
    expect(m.fiber).toEqual({ value: 2, complete: true });
    expect(m.salt.complete).toBe(false);
    expect(m.salt.value).toBeCloseTo(0.6);
  });
});

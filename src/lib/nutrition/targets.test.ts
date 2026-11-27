import { describe, expect, it } from 'vitest';
import {
  bmr,
  calorieTarget,
  computeTargets,
  dailyAdjustment,
  effectiveTargets,
  kcalFromMacros,
  macroSplit,
  profileAge,
  tdee,
} from './targets';
import type { Profile } from './types';

const base: Profile = {
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

describe('bmr (Mifflin-St Jeor)', () => {
  it('matches the reference formula for a man', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 })).toBe(1780);
  });
  it('matches the reference formula for a woman', () => {
    // 10*60 + 6.25*165 - 5*28 - 161 = 1330.25
    expect(bmr({ sex: 'female', weightKg: 60, heightCm: 165, age: 28 })).toBeCloseTo(1330.25);
  });
});

describe('tdee', () => {
  it('applies the five activity factors', () => {
    expect(tdee(1000, 'sedentary')).toBeCloseTo(1200);
    expect(tdee(1000, 'light')).toBeCloseTo(1375);
    expect(tdee(1000, 'moderate')).toBeCloseTo(1550);
    expect(tdee(1000, 'active')).toBeCloseTo(1725);
    expect(tdee(1000, 'very_active')).toBeCloseTo(1900);
  });
});

describe('dailyAdjustment', () => {
  it('uses 7700 kcal per kg', () => {
    expect(dailyAdjustment('lose', 0.5)).toBeCloseTo(-550);
    expect(dailyAdjustment('lose', 0.25)).toBeCloseTo(-275);
    expect(dailyAdjustment('gain', 0.25)).toBeCloseTo(275);
    expect(dailyAdjustment('maintain', 1)).toBe(0);
  });
});

describe('calorieTarget', () => {
  it('subtracts the deficit and rounds to 10 kcal', () => {
    const t = calorieTarget({ sex: 'male', bmr: 1780, tdee: 2759, goal: 'lose', rateKgPerWeek: 0.5 });
    expect(t.kcal).toBe(2210);
    expect(t.clamped).toBe(false);
  });
  it('never goes below the sex minimum', () => {
    const t = calorieTarget({ sex: 'female', bmr: 1100, tdee: 1500, goal: 'lose', rateKgPerWeek: 1 });
    expect(t.kcal).toBe(1200);
    expect(t.clamped).toBe(true);
  });
  it('never goes below the basal metabolic rate', () => {
    const t = calorieTarget({ sex: 'male', bmr: 2000, tdee: 2400, goal: 'lose', rateKgPerWeek: 1 });
    expect(t.kcal).toBe(2000);
    expect(t.clamped).toBe(true);
  });
  it('does not clamp a surplus', () => {
    const t = calorieTarget({ sex: 'female', bmr: 1100, tdee: 1300, goal: 'gain', rateKgPerWeek: 0.25 });
    expect(t.kcal).toBe(1580);
    expect(t.clamped).toBe(false);
  });
});

describe('macroSplit', () => {
  it('uses g/kg for protein and fat, carbs take the rest', () => {
    const m = macroSplit(2200, 80, 1.8, 0.8);
    expect(m.protein).toBe(144);
    expect(m.fat).toBe(64);
    // (2200 - 144*4 - 64*9) / 4 = 262
    expect(m.carbs).toBe(262);
    expect(m.carbsClamped).toBe(false);
  });
  it('clamps carbs at zero', () => {
    const m = macroSplit(1200, 150, 2.2, 1);
    expect(m.carbs).toBe(0);
    expect(m.carbsClamped).toBe(true);
  });
});

describe('profileAge', () => {
  it('uses the birth date when present', () => {
    expect(profileAge({ birthDate: '1990-06-15' }, '2026-06-14')).toBe(35);
    expect(profileAge({ birthDate: '1990-06-15' }, '2026-06-15')).toBe(36);
  });
  it('ages a recorded age over time', () => {
    expect(profileAge({ age: 30, ageRecordedOn: '2026-01-01' }, '2026-12-31')).toBe(30);
    expect(profileAge({ age: 30, ageRecordedOn: '2026-01-01' }, '2028-01-02')).toBe(32);
  });
});

describe('computeTargets', () => {
  it('chains BMR, TDEE, goal and macros', () => {
    const t = computeTargets(base, '2026-03-01');
    expect(t.bmr).toBe(1780);
    expect(t.tdee).toBe(2759);
    expect(t.kcal).toBe(2210);
    expect(t.protein).toBe(144);
    expect(t.fat).toBe(64);
    expect(t.carbs).toBe(Math.round((2210 - 144 * 4 - 64 * 9) / 4));
  });
  it('maintenance equals TDEE', () => {
    expect(computeTargets({ ...base, goal: 'maintain' }, '2026-03-01').kcal).toBe(2760);
  });
  it('uses the override when set', () => {
    const override = { kcal: 2000, protein: 150, carbs: 200, fat: 67 };
    expect(effectiveTargets({ ...base, override }, '2026-03-01')).toEqual(override);
    expect(effectiveTargets(base, '2026-03-01').kcal).toBe(2210);
  });
});

it('kcalFromMacros uses 4/4/9', () => {
  expect(kcalFromMacros({ protein: 100, carbs: 200, fat: 50 })).toBe(1650);
});

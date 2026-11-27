import { ageOn, diffDays, type ISODate } from '../date';
import type { ActivityLevel, Goal, MacroTargets, Profile, Sex } from './types';

export const ACTIVITY_LEVELS: { id: ActivityLevel; factor: number; label: string; hint: string }[] = [
  { id: 'sedentary', factor: 1.2, label: 'Sédentaire', hint: 'Travail assis, peu ou pas de sport' },
  { id: 'light', factor: 1.375, label: 'Légèrement actif', hint: 'Sport léger 1 à 3 fois par semaine' },
  { id: 'moderate', factor: 1.55, label: 'Actif', hint: 'Sport 3 à 5 fois par semaine' },
  { id: 'active', factor: 1.725, label: 'Très actif', hint: 'Sport intense 6 à 7 fois par semaine' },
  { id: 'very_active', factor: 1.9, label: 'Extrêmement actif', hint: 'Métier physique et entraînement quotidien' },
];

export const GOALS: { id: Goal; label: string }[] = [
  { id: 'lose', label: 'Perdre' },
  { id: 'maintain', label: 'Maintenir' },
  { id: 'gain', label: 'Prendre' },
];

/** Allowed weekly rates (kg/week) per goal. */
export const RATES: Record<Goal, number[]> = {
  lose: [0.25, 0.5, 0.75, 1],
  maintain: [0],
  gain: [0.25, 0.5],
};

export const DEFAULT_RATE: Record<Goal, number> = { lose: 0.5, maintain: 0, gain: 0.25 };
export const DEFAULT_PROTEIN_PER_KG = 1.8;
export const DEFAULT_FAT_PER_KG = 0.8;

/** Energy content of 1 kg of body weight change (kcal). */
export const KCAL_PER_KG = 7700;

/** Lowest daily target we will ever suggest, per sex. */
export const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export const activityFactor = (level: ActivityLevel): number =>
  ACTIVITY_LEVELS.find((a) => a.id === level)?.factor ?? 1.2;

/** Mifflin-St Jeor basal metabolic rate, kcal/day. */
export function bmr(p: { sex: Sex; weightKg: number; heightCm: number; age: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

/** Total daily energy expenditure, kcal/day. */
export function tdee(bmrValue: number, level: ActivityLevel): number {
  return bmrValue * activityFactor(level);
}

/** Signed daily calorie adjustment for a goal and weekly rate. */
export function dailyAdjustment(goal: Goal, rateKgPerWeek: number): number {
  if (goal === 'maintain') return 0;
  const delta = (Math.abs(rateKgPerWeek) * KCAL_PER_KG) / 7;
  return goal === 'lose' ? -delta : delta;
}

export interface CalorieTarget {
  kcal: number;
  /** Target before the safety floor. */
  raw: number;
  floor: number;
  /** True when the floor raised the target. */
  clamped: boolean;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

export function calorieTarget(p: {
  sex: Sex;
  bmr: number;
  tdee: number;
  goal: Goal;
  rateKgPerWeek: number;
}): CalorieTarget {
  const raw = p.tdee + dailyAdjustment(p.goal, p.rateKgPerWeek);
  // Never go below the sex minimum nor below the basal metabolic rate.
  const floor = Math.max(MIN_KCAL[p.sex], Math.round(p.bmr));
  const clamped = p.goal === 'lose' && raw < floor;
  const kcal = round10(clamped ? floor : raw);
  return { kcal, raw: Math.round(raw), floor, clamped };
}

export interface MacroSplit {
  protein: number;
  fat: number;
  carbs: number;
  /** True when protein and fat already exceed the calorie budget. */
  carbsClamped: boolean;
}

export function macroSplit(
  kcal: number,
  weightKg: number,
  proteinPerKg = DEFAULT_PROTEIN_PER_KG,
  fatPerKg = DEFAULT_FAT_PER_KG,
): MacroSplit {
  const protein = Math.round(weightKg * proteinPerKg);
  const fat = Math.round(weightKg * fatPerKg);
  const rest = kcal - protein * 4 - fat * 9;
  return { protein, fat, carbs: Math.max(0, Math.round(rest / 4)), carbsClamped: rest < 0 };
}

export function profileAge(p: Pick<Profile, 'birthDate' | 'age' | 'ageRecordedOn'>, today: ISODate): number {
  if (p.birthDate) return ageOn(p.birthDate, today);
  const base = p.age ?? 30;
  if (!p.ageRecordedOn) return base;
  return base + Math.max(0, Math.floor(diffDays(p.ageRecordedOn, today) / 365.25));
}

export interface ComputedTargets extends MacroTargets {
  age: number;
  bmr: number;
  tdee: number;
  /** Expenditure from the Mifflin-St Jeor formula, whatever is used. */
  formulaTdee: number;
  /** True when `tdee` comes from real data (adaptive mode). */
  adaptive: boolean;
  adjustment: number;
  clamped: boolean;
  carbsClamped: boolean;
}

/** Automatic targets from the profile (ignores the manual override). */
export function computeTargets(p: Profile, today: ISODate): ComputedTargets {
  const age = profileAge(p, today);
  const b = bmr({ sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm, age });
  const formula = tdee(b, p.activity);
  const adaptive = !!(p.adaptive && p.adaptiveTdee);
  const t = adaptive ? p.adaptiveTdee!.kcal : formula;
  const cal = calorieTarget({ sex: p.sex, bmr: b, tdee: t, goal: p.goal, rateKgPerWeek: p.rateKgPerWeek });
  const m = macroSplit(cal.kcal, p.weightKg, p.proteinPerKg, p.fatPerKg);
  return {
    age,
    bmr: Math.round(b),
    tdee: Math.round(t),
    formulaTdee: Math.round(formula),
    adaptive,
    adjustment: Math.round(dailyAdjustment(p.goal, p.rateKgPerWeek)),
    kcal: cal.kcal,
    clamped: cal.clamped,
    protein: m.protein,
    fat: m.fat,
    carbs: m.carbs,
    carbsClamped: m.carbsClamped,
  };
}

/** Targets actually used by the app: manual override when set, else automatic. */
export function effectiveTargets(p: Profile, today: ISODate): MacroTargets {
  if (p.override) return p.override;
  const { kcal, protein, carbs, fat } = computeTargets(p, today);
  return { kcal, protein, carbs, fat };
}

/** Calories implied by macros (4/4/9). */
export const kcalFromMacros = (m: { protein: number; carbs: number; fat: number }) =>
  Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9);

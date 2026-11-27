import type { ISODate } from '../date';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';
export type MealId = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Profile {
  sex: Sex;
  /** Either a birth date, or an age recorded on a given day. */
  birthDate?: ISODate;
  age?: number;
  ageRecordedOn?: ISODate;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  /** Magnitude in kg per week (always >= 0, sign comes from the goal). */
  rateKgPerWeek: number;
  proteinPerKg: number;
  fatPerKg: number;
  /** Manual targets. null means automatic. */
  override: MacroTargets | null;
  /** Use the expenditure measured from real data instead of the formula. */
  adaptive?: boolean;
  /** Last measured expenditure applied to the targets. */
  adaptiveTdee?: { kcal: number; on: ISODate } | null;
  updatedAt: number;
}

/** Nutrient values, per 100 g for foods or absolute for totals. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugars?: number;
  fiber?: number;
  salt?: number;
}

export const MEALS: { id: MealId; label: string; short: string }[] = [
  { id: 'breakfast', label: 'Petit-déjeuner', short: 'Petit-déj.' },
  { id: 'lunch', label: 'Déjeuner', short: 'Déjeuner' },
  { id: 'dinner', label: 'Dîner', short: 'Dîner' },
  { id: 'snack', label: 'Collations', short: 'Collation' },
];

export const mealLabel = (id: MealId) => MEALS.find((m) => m.id === id)?.label ?? id;

/** Meal guessed from the time of day, used by the floating + button. */
export function mealForHour(hour: number): MealId {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 18 && hour < 23) return 'dinner';
  return 'snack';
}

import { addDays, type ISODate } from '../date';
import { ZERO, scaleNutrients, sumNutrients } from './food';
import type { Nutrients } from './types';

export interface DatedPortion {
  date: ISODate;
  grams: number;
  per100: Nutrients;
}

export function dailyTotals(entries: Iterable<DatedPortion>): Map<ISODate, Nutrients> {
  const map = new Map<ISODate, Nutrients>();
  for (const e of entries) {
    const n = scaleNutrients(e.per100, e.grams);
    const prev = map.get(e.date);
    map.set(e.date, prev ? sumNutrients([prev, n]) : n);
  }
  return map;
}

/** Consecutive logged days ending today, or ending yesterday if today is still empty. */
export function currentStreak(logged: Set<ISODate>, today: ISODate): number {
  let d = logged.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (logged.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export interface PeriodStats {
  days: number;
  daysLogged: number;
  /** Average per logged day. */
  avg: Nutrients;
  /** Logged days within ±10 % of the calorie target. */
  daysOnTarget: number;
  streak: number;
  series: { date: ISODate; kcal: number | null }[];
}

export function periodStats(
  totals: Map<ISODate, Nutrients>,
  end: ISODate,
  days: number,
  kcalTarget: number,
  today: ISODate = end,
): PeriodStats {
  const series: PeriodStats['series'] = [];
  const logged: Nutrients[] = [];
  let onTarget = 0;
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(end, -i);
    const t = totals.get(date);
    const has = !!t && t.kcal > 0;
    series.push({ date, kcal: has ? t.kcal : null });
    if (has) {
      logged.push(t);
      if (kcalTarget > 0 && Math.abs(t.kcal - kcalTarget) <= kcalTarget * 0.1) onTarget++;
    }
  }
  const sum = sumNutrients(logged);
  const n = logged.length;
  const avg: Nutrients = n
    ? { kcal: sum.kcal / n, protein: sum.protein / n, carbs: sum.carbs / n, fat: sum.fat / n }
    : { ...ZERO };
  const loggedSet = new Set([...totals].filter(([, v]) => v.kcal > 0).map(([d]) => d));
  return {
    days,
    daysLogged: n,
    avg,
    daysOnTarget: onTarget,
    streak: currentStreak(loggedSet, today),
    series,
  };
}

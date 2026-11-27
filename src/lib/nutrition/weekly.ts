import { addDays, parseISODate, type ISODate } from '../date';
import type { MacroTargets, Nutrients } from './types';
import type { WeightPoint } from './weight';

/** Monday of the week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  const dow = (parseISODate(date).getDay() + 6) % 7;
  return addDays(date, -dow);
}

export interface WeekReview {
  start: ISODate;
  end: ISODate;
  daysLogged: number;
  avgKcal: number | null;
  avgProtein: number | null;
  /** Logged days within ±10 % of the calorie target. */
  daysOnTarget: number;
  /** Logged days reaching at least 90 % of the protein target. */
  proteinDays: number;
  /** Mean weigh-in of this week minus mean of the previous week. */
  weightChange: number | null;
  weighIns: number;
  waterAvgMl: number | null;
  highlights: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function weekReview(input: {
  start: ISODate;
  totals: Map<ISODate, Nutrients>;
  weights: WeightPoint[];
  water: Map<ISODate, number>;
  targets: MacroTargets;
  /** -1 to lose, 0 to maintain, 1 to gain. */
  direction: number;
}): WeekReview {
  const { start, totals, targets } = input;
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const logged = days.map((d) => totals.get(d)).filter((t): t is Nutrients => !!t && t.kcal > 0);
  const daysOnTarget = logged.filter((t) => Math.abs(t.kcal - targets.kcal) <= targets.kcal * 0.1).length;
  const proteinDays = logged.filter((t) => t.protein >= targets.protein * 0.9).length;
  const inWeek = input.weights.filter((w) => w.date >= start && w.date <= end).map((w) => w.kg);
  const prevStart = addDays(start, -7);
  const inPrev = input.weights.filter((w) => w.date >= prevStart && w.date < start).map((w) => w.kg);
  const a = mean(inWeek);
  const b = mean(inPrev);
  const weightChange = a != null && b != null ? Math.round((a - b) * 10) / 10 : null;
  const waters = days.map((d) => input.water.get(d) ?? 0).filter((ml) => ml > 0);

  const r: WeekReview = {
    start,
    end,
    daysLogged: logged.length,
    avgKcal: mean(logged.map((t) => t.kcal)),
    avgProtein: mean(logged.map((t) => t.protein)),
    daysOnTarget,
    proteinDays,
    weightChange,
    weighIns: inWeek.length,
    waterAvgMl: waters.length ? Math.round(mean(waters)!) : null,
    highlights: [],
  };
  r.highlights = highlights(r, input.direction);
  return r;
}

const fmt1 = (n: number) => String(Math.abs(Math.round(n * 10) / 10)).replace('.', ',');

function highlights(r: WeekReview, direction: number): string[] {
  const out: string[] = [];
  if (r.daysLogged === 7) out.push('Semaine complète : 7 jours notés sur 7.');
  else if (r.daysLogged >= 5) out.push(`${r.daysLogged} jours notés sur 7, belle régularité.`);
  if (r.weightChange != null) {
    const good = direction < 0 ? r.weightChange < 0 : direction > 0 ? r.weightChange > 0 : Math.abs(r.weightChange) <= 0.3;
    if (good && r.weightChange !== 0) {
      out.push(`Poids moyen ${r.weightChange < 0 ? 'en baisse' : 'en hausse'} de ${fmt1(r.weightChange)} kg.`);
    } else if (good) {
      out.push('Poids moyen stable.');
    }
  }
  if (r.proteinDays >= 5) out.push(`Protéines atteintes ${r.proteinDays} jours sur 7.`);
  if (!out.length) {
    out.push(
      r.daysLogged < 4
        ? 'Objectif de la semaine : noter au moins 5 jours.'
        : 'Semaine en demi-teinte : on repart sur de bonnes bases.',
    );
  }
  return out.slice(0, 2);
}

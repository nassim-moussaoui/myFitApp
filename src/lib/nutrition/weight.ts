import { addDays, diffDays, type ISODate } from '../date';

export interface WeightPoint {
  date: ISODate;
  kg: number;
}

export const sortByDate = <T extends { date: ISODate }>(points: T[]): T[] =>
  [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/**
 * Time-based moving average: for each point, the mean of all points
 * within the `windowDays` days ending on that point's date.
 * Input must be sorted by date.
 */
export function movingAverage(points: WeightPoint[], windowDays = 7): WeightPoint[] {
  const out: WeightPoint[] = [];
  let start = 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    sum += p.kg;
    const minDate = addDays(p.date, -(windowDays - 1));
    while (points[start]!.date < minDate) {
      sum -= points[start]!.kg;
      start++;
    }
    out.push({ date: p.date, kg: sum / (i - start + 1) });
  }
  return out;
}

/**
 * Weekly trend in kg/week: least-squares slope over the last `spanDays`
 * days of data. Returns null when the data is too sparse to be meaningful.
 */
export function weeklyTrend(points: WeightPoint[], spanDays = 28): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1]!;
  const from = addDays(last.date, -(spanDays - 1));
  const recent = points.filter((p) => p.date >= from);
  if (recent.length < 3) return null;
  const xs = recent.map((p) => diffDays(from, p.date));
  if (xs[xs.length - 1]! - xs[0]! < 6) return null;
  const n = recent.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = recent.reduce((a, p) => a + p.kg, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    num += dx * (recent[i]!.kg - my);
    den += dx * dx;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}

/** Latest point (input sorted by date). */
export const latest = (points: WeightPoint[]): WeightPoint | undefined => points[points.length - 1];

import { addDays, diffDays, type ISODate } from '../date';
import { KCAL_PER_KG } from './targets';
import type { WeightPoint } from './weight';

/**
 * Real energy expenditure estimated from what was eaten and how the weight moved:
 * TDEE = average intake - (weight change per day x 7700 kcal/kg).
 * Blended with the formula while data is thin, so the estimate never jumps around.
 */

export type Confidence = 'low' | 'medium' | 'high';

export interface AdaptiveEstimate {
  /** Blended value used by the app, rounded to 10 kcal. */
  tdee: number;
  /** Pure data estimate, before blending. */
  raw: number;
  formula: number;
  avgIntake: number;
  /** Weight change in kg/week over the window. */
  weeklyChange: number;
  loggedDays: number;
  weighIns: number;
  confidence: Confidence;
  from: ISODate;
  to: ISODate;
}

export type AdaptiveResult =
  | { ok: true; estimate: AdaptiveEstimate }
  | { ok: false; reason: string; loggedDays: number; weighIns: number };

export const ADAPTIVE_WINDOW = 28;
export const MIN_LOGGED_DAYS = 10;
export const MIN_WEIGH_INS = 4;
export const MIN_WEIGHT_SPAN = 10;

const BLEND: Record<Confidence, number> = { low: 0.4, medium: 0.65, high: 0.85 };

/** Least-squares slope in kg/day. */
function slopePerDay(points: WeightPoint[], origin: ISODate): number {
  const xs = points.map((p) => diffDays(origin, p.date));
  const n = points.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = points.reduce((a, p) => a + p.kg, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (points[i]!.kg - my);
    den += (xs[i]! - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function estimateTdee(input: {
  /** Calories logged per day. */
  dailyKcal: Map<ISODate, number>;
  /** Weigh-ins sorted by date. */
  weights: WeightPoint[];
  /** Last complete day (usually yesterday). */
  end: ISODate;
  formulaTdee: number;
  targetKcal: number;
  days?: number;
}): AdaptiveResult {
  const days = input.days ?? ADAPTIVE_WINDOW;
  const from = addDays(input.end, -(days - 1));
  // A day counts when it looks fully logged (not a forgotten dinner).
  const minDay = Math.max(800, input.targetKcal * 0.4);
  const intakes: number[] = [];
  for (const [d, kcal] of input.dailyKcal) {
    if (d >= from && d <= input.end && kcal >= minDay) intakes.push(kcal);
  }
  const ws = input.weights.filter((w) => w.date >= from && w.date <= input.end);
  const loggedDays = intakes.length;
  const weighIns = ws.length;
  if (loggedDays < MIN_LOGGED_DAYS) {
    return {
      ok: false,
      loggedDays,
      weighIns,
      reason: `Note tes repas au moins ${MIN_LOGGED_DAYS} jours sur les 4 dernières semaines (${loggedDays} pour l'instant).`,
    };
  }
  const span = ws.length ? diffDays(ws[0]!.date, ws[ws.length - 1]!.date) : 0;
  if (weighIns < MIN_WEIGH_INS || span < MIN_WEIGHT_SPAN) {
    return {
      ok: false,
      loggedDays,
      weighIns,
      reason: `Pèse-toi au moins ${MIN_WEIGH_INS} fois sur ${MIN_WEIGHT_SPAN} jours ou plus (${weighIns} pesée${weighIns > 1 ? 's' : ''} pour l'instant).`,
    };
  }
  const avgIntake = intakes.reduce((a, b) => a + b, 0) / loggedDays;
  const slope = slopePerDay(ws, from);
  const f = input.formulaTdee;
  const raw = Math.min(f * 1.3, Math.max(f * 0.7, avgIntake - slope * KCAL_PER_KG));
  const confidence: Confidence =
    loggedDays >= 21 && weighIns >= 10 ? 'high' : loggedDays >= 14 && weighIns >= 6 ? 'medium' : 'low';
  const w = BLEND[confidence];
  return {
    ok: true,
    estimate: {
      tdee: Math.round((w * raw + (1 - w) * f) / 10) * 10,
      raw: Math.round(raw),
      formula: Math.round(f),
      avgIntake: Math.round(avgIntake),
      weeklyChange: Math.round(slope * 7 * 100) / 100,
      loggedDays,
      weighIns,
      confidence,
      from,
      to: input.end,
    },
  };
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Fiabilité faible',
  medium: 'Fiabilité moyenne',
  high: 'Fiabilité bonne',
};

import { addDays, diffDays, type ISODate } from '../date';
import { KCAL_PER_KG, computeTargets, effectiveTargets } from './targets';
import type { Profile } from './types';

/** A short-term weight target (a "palier"), e.g. -2 kg in 30 days. */
export interface Milestone {
  startDate: ISODate;
  startKg: number;
  targetKg: number;
  dueDate: ISODate;
}

export interface ReachedMilestone extends Milestone {
  reachedDate: ISODate;
  reachedKg: number;
}

export interface WeightGoals {
  /** Long-term target, optional. Milestones never go past it. */
  finalKg: number | null;
  /** Length of a milestone in days. */
  durationDays: number;
  current: Milestone | null;
  history: ReachedMilestone[];
  /** Set when the final target has been reached. */
  finalReachedDate: ISODate | null;
}

export const MILESTONE_DURATIONS = [14, 30, 60] as const;

export const DEFAULT_GOALS: WeightGoals = {
  finalKg: null,
  durationDays: 30,
  current: null,
  history: [],
  finalReachedDate: null,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Expected weight change in kg/week (signed) from the calorie target actually
 * used: (target - TDEE) x 7 / 7700. Includes the safety floor and manual targets.
 */
export function plannedWeeklyRate(profile: Profile, today: ISODate): number {
  const { tdee } = computeTargets(profile, today);
  const { kcal } = effectiveTargets(profile, today);
  const rate = ((kcal - tdee) * 7) / KCAL_PER_KG;
  return Math.abs(rate) < 0.05 ? 0 : Math.round(rate * 100) / 100;
}

/** Weight expected on `date`, held at `finalKg` once it is reached. */
export function projectKg(
  anchor: { date: ISODate; kg: number },
  weeklyRate: number,
  date: ISODate,
  finalKg: number | null = null,
): number {
  let kg = anchor.kg + (weeklyRate * diffDays(anchor.date, date)) / 7;
  if (finalKg != null && weeklyRate !== 0) {
    const pastFinal = weeklyRate < 0 ? anchor.kg <= finalKg : anchor.kg >= finalKg;
    if (!pastFinal) kg = weeklyRate < 0 ? Math.max(kg, finalKg) : Math.min(kg, finalKg);
  }
  return kg;
}

/** Date at which `targetKg` should be reached at this rate, or null if it never will. */
export function etaDate(anchor: { date: ISODate; kg: number }, weeklyRate: number, targetKg: number): ISODate | null {
  const delta = targetKg - anchor.kg;
  if (Math.abs(delta) < 0.05) return anchor.date;
  if (weeklyRate === 0 || Math.sign(delta) !== Math.sign(weeklyRate)) return null;
  return addDays(anchor.date, Math.ceil((delta / weeklyRate) * 7));
}

/** Direction of a milestone: -1 to lose, +1 to gain. */
export const milestoneDirection = (m: Milestone) => Math.sign(m.targetKg - m.startKg);

/** Next milestone from a starting weight, or null when there is nothing to aim for. */
export function makeMilestone(
  startDate: ISODate,
  startKg: number,
  weeklyRate: number,
  days: number,
  finalKg: number | null,
): Milestone | null {
  if (weeklyRate === 0) return null;
  let target = round1(startKg + (weeklyRate * days) / 7);
  if (finalKg != null) {
    target = weeklyRate < 0 ? Math.max(target, finalKg) : Math.min(target, finalKg);
  }
  if (Math.sign(target - startKg) !== Math.sign(weeklyRate) || Math.abs(target - startKg) < 0.1) return null;
  return { startDate, startKg: round1(startKg), targetKg: round1(target), dueDate: addDays(startDate, days) };
}

export function isReached(m: Milestone, kg: number): boolean {
  return milestoneDirection(m) < 0 ? kg <= m.targetKg : kg >= m.targetKg;
}

/** 0 at the start weight, 1 at the target. */
export function milestoneProgress(m: Milestone, kg: number): number {
  const span = m.startKg - m.targetKg;
  if (span === 0) return 1;
  return Math.min(1, Math.max(0, (m.startKg - kg) / span));
}

export function finalReached(finalKg: number, kg: number, weeklyRate: number, startKg: number): boolean {
  const dir = weeklyRate !== 0 ? Math.sign(weeklyRate) : Math.sign(finalKg - startKg);
  return dir < 0 ? kg <= finalKg : kg >= finalKg;
}

export interface AdvanceResult {
  goals: WeightGoals;
  reached: ReachedMilestone | null;
  finalJustReached: boolean;
}

/**
 * Brings the goals up to date with the latest weigh-in:
 * validates a reached milestone and immediately starts the next one,
 * (re)creates a milestone when there is none or when the goal changed direction.
 */
export function advanceGoals(goals: WeightGoals, latest: { date: ISODate; kg: number }, weeklyRate: number): AdvanceResult {
  let g: WeightGoals = goals;
  let reached: ReachedMilestone | null = null;
  let finalJustReached = false;
  const cur = g.current;

  if (cur && latest.date >= cur.startDate && isReached(cur, latest.kg)) {
    reached = { ...cur, reachedDate: latest.date, reachedKg: latest.kg };
    g = {
      ...g,
      history: [...g.history, reached],
      current: makeMilestone(latest.date, latest.kg, weeklyRate, g.durationDays, g.finalKg),
    };
  } else if (!cur || (weeklyRate !== 0 && milestoneDirection(cur) !== Math.sign(weeklyRate)) || weeklyRate === 0) {
    const next = makeMilestone(latest.date, latest.kg, weeklyRate, g.durationDays, g.finalKg);
    if (next || cur) g = { ...g, current: next };
  }

  if (g.finalKg != null && !g.finalReachedDate) {
    const start = g.history[0]?.startKg ?? g.current?.startKg ?? latest.kg;
    if (start !== g.finalKg && finalReached(g.finalKg, latest.kg, weeklyRate, start)) {
      finalJustReached = true;
      g = { ...g, finalReachedDate: latest.date };
    }
  }
  return { goals: g, reached, finalJustReached };
}

/** Same milestone, more time. */
export function extendMilestone(m: Milestone, days: number): Milestone {
  return { ...m, dueDate: addDays(m.dueDate, days) };
}

export interface MilestoneSummary {
  achieved: number;
  totalKg: number;
}

export function historySummary(history: ReachedMilestone[]): MilestoneSummary {
  if (!history.length) return { achieved: 0, totalKg: 0 };
  return {
    achieved: history.length,
    totalKg: round1(history[history.length - 1]!.reachedKg - history[0]!.startKg),
  };
}

export function isGoals(v: unknown): v is WeightGoals {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return typeof g.durationDays === 'number' && Array.isArray(g.history);
}

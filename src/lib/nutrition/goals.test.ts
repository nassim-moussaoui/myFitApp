import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOALS,
  advanceGoals,
  etaDate,
  extendMilestone,
  historySummary,
  isReached,
  makeMilestone,
  milestoneProgress,
  plannedWeeklyRate,
  projectKg,
} from './goals';
import type { Profile } from './types';

const profile: Profile = {
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

describe('plannedWeeklyRate', () => {
  it('follows the calorie target actually used', () => {
    // TDEE 2759, target 2210: -549 kcal/day -> about -0.5 kg/week
    expect(plannedWeeklyRate(profile, '2026-03-01')).toBeCloseTo(-0.5, 1);
  });
  it('reflects the safety floor', () => {
    const p = { ...profile, rateKgPerWeek: 1 }; // floored at the BMR (1780): -979 kcal/day
    expect(plannedWeeklyRate(p, '2026-03-01')).toBeCloseTo(-0.89, 2);
  });
  it('reflects manual targets', () => {
    const p = { ...profile, override: { kcal: 2759 + 275, protein: 150, carbs: 300, fat: 80 } };
    expect(plannedWeeklyRate(p, '2026-03-01')).toBeCloseTo(0.25, 2);
  });
  it('is zero for maintenance', () => {
    expect(plannedWeeklyRate({ ...profile, goal: 'maintain', rateKgPerWeek: 0 }, '2026-03-01')).toBe(0);
  });
});

describe('makeMilestone', () => {
  it('aims for rate x duration', () => {
    expect(makeMilestone('2026-03-01', 80, -0.5, 30, null)).toEqual({
      startDate: '2026-03-01',
      startKg: 80,
      targetKg: 77.9,
      dueDate: '2026-03-31',
    });
  });
  it('never goes past the final target', () => {
    expect(makeMilestone('2026-03-01', 73, -0.5, 30, 72)?.targetKg).toBe(72);
    expect(makeMilestone('2026-03-01', 72, -0.5, 30, 72)).toBeNull();
  });
  it('works for weight gain', () => {
    expect(makeMilestone('2026-03-01', 60, 0.25, 28, null)?.targetKg).toBe(61);
  });
  it('returns null without a rate', () => {
    expect(makeMilestone('2026-03-01', 80, 0, 30, null)).toBeNull();
  });
});

describe('progress and reach', () => {
  const m = makeMilestone('2026-03-01', 80, -0.5, 30, null)!;
  it('measures progress from start to target', () => {
    expect(milestoneProgress(m, 80)).toBe(0);
    expect(milestoneProgress(m, 79)).toBeCloseTo(1 / 2.1);
    expect(milestoneProgress(m, 81)).toBe(0);
    expect(milestoneProgress(m, 77)).toBe(1);
  });
  it('detects a reached target in the right direction', () => {
    expect(isReached(m, 78)).toBe(false);
    expect(isReached(m, 77.9)).toBe(true);
    const gain = makeMilestone('2026-03-01', 60, 0.25, 28, null)!;
    expect(isReached(gain, 61.2)).toBe(true);
    expect(isReached(gain, 59)).toBe(false);
  });
  it('extends the deadline', () => {
    expect(extendMilestone(m, 30).dueDate).toBe('2026-04-30');
  });
});

describe('advanceGoals', () => {
  it('creates the first milestone', () => {
    const r = advanceGoals(DEFAULT_GOALS, { date: '2026-03-01', kg: 80 }, -0.5);
    expect(r.goals.current?.targetKg).toBe(77.9);
    expect(r.reached).toBeNull();
  });
  it('keeps going while not reached', () => {
    const g = advanceGoals(DEFAULT_GOALS, { date: '2026-03-01', kg: 80 }, -0.5).goals;
    const r = advanceGoals(g, { date: '2026-03-10', kg: 79 }, -0.5);
    expect(r.goals).toBe(g);
  });
  it('validates a reached milestone and starts the next one from that weigh-in', () => {
    const g = advanceGoals(DEFAULT_GOALS, { date: '2026-03-01', kg: 80 }, -0.5).goals;
    const r = advanceGoals(g, { date: '2026-03-20', kg: 77.8 }, -0.5);
    expect(r.reached).toMatchObject({ targetKg: 77.9, reachedDate: '2026-03-20', reachedKg: 77.8 });
    expect(r.goals.history).toHaveLength(1);
    expect(r.goals.current).toEqual({
      startDate: '2026-03-20',
      startKg: 77.8,
      targetKg: 75.7,
      dueDate: '2026-04-19',
    });
  });
  it('ignores weigh-ins older than the milestone', () => {
    const g = advanceGoals(DEFAULT_GOALS, { date: '2026-03-01', kg: 80 }, -0.5).goals;
    expect(advanceGoals(g, { date: '2026-02-01', kg: 70 }, -0.5).reached).toBeNull();
  });
  it('restarts when the goal changes direction', () => {
    const g = advanceGoals(DEFAULT_GOALS, { date: '2026-03-01', kg: 80 }, -0.5).goals;
    const r = advanceGoals(g, { date: '2026-03-05', kg: 79.5 }, 0.25);
    expect(r.goals.current?.targetKg).toBeGreaterThan(79.5);
  });
  it('clears the milestone in maintenance', () => {
    const g = advanceGoals(DEFAULT_GOALS, { date: '2026-03-01', kg: 80 }, -0.5).goals;
    expect(advanceGoals(g, { date: '2026-03-05', kg: 79.5 }, 0).goals.current).toBeNull();
  });
  it('flags the final target once', () => {
    const g0 = { ...DEFAULT_GOALS, finalKg: 79 };
    const g1 = advanceGoals(g0, { date: '2026-03-01', kg: 80 }, -0.5).goals;
    expect(g1.current?.targetKg).toBe(79);
    const r = advanceGoals(g1, { date: '2026-03-12', kg: 78.9 }, -0.5);
    expect(r.finalJustReached).toBe(true);
    expect(r.goals.current).toBeNull();
    expect(advanceGoals(r.goals, { date: '2026-03-13', kg: 78.5 }, -0.5).finalJustReached).toBe(false);
  });
});

describe('projection', () => {
  const anchor = { date: '2026-03-01', kg: 80 };
  it('projects linearly', () => {
    expect(projectKg(anchor, -0.5, '2026-03-29')).toBeCloseTo(78);
  });
  it('holds at the final target', () => {
    expect(projectKg(anchor, -0.5, '2026-12-01', 75)).toBe(75);
  });
  it('estimates the arrival date', () => {
    expect(etaDate(anchor, -0.5, 78)).toBe('2026-03-29');
    expect(etaDate(anchor, -0.5, 82)).toBeNull();
    expect(etaDate(anchor, 0, 78)).toBeNull();
  });
});

it('summarises reached milestones', () => {
  const g = advanceGoals(DEFAULT_GOALS, { date: '2026-03-01', kg: 80 }, -0.5).goals;
  const g2 = advanceGoals(g, { date: '2026-03-20', kg: 77.8 }, -0.5).goals;
  const g3 = advanceGoals(g2, { date: '2026-04-15', kg: 75.6 }, -0.5).goals;
  expect(historySummary(g3.history)).toEqual({ achieved: 2, totalKg: -4.4 });
});

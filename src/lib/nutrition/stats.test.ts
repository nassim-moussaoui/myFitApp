import { describe, expect, it } from 'vitest';
import { currentStreak, dailyTotals, periodStats } from './stats';

const per100 = { kcal: 100, protein: 10, carbs: 10, fat: 1 };

describe('dailyTotals', () => {
  it('groups portions by day', () => {
    const m = dailyTotals([
      { date: '2026-03-01', grams: 100, per100 },
      { date: '2026-03-01', grams: 200, per100 },
      { date: '2026-03-02', grams: 50, per100 },
    ]);
    expect(m.get('2026-03-01')?.kcal).toBe(300);
    expect(m.get('2026-03-02')?.kcal).toBe(50);
  });
});

describe('currentStreak', () => {
  it('counts back from today', () => {
    expect(currentStreak(new Set(['2026-03-03', '2026-03-02', '2026-03-01']), '2026-03-03')).toBe(3);
  });
  it('keeps the streak alive while today is empty', () => {
    expect(currentStreak(new Set(['2026-03-02', '2026-03-01']), '2026-03-03')).toBe(2);
  });
  it('breaks on a gap', () => {
    expect(currentStreak(new Set(['2026-03-03', '2026-03-01']), '2026-03-03')).toBe(1);
  });
});

describe('periodStats', () => {
  const totals = dailyTotals([
    { date: '2026-03-07', grams: 2000, per100 }, // 2000 kcal, on target
    { date: '2026-03-06', grams: 2500, per100 }, // 2500, off target
    { date: '2026-03-04', grams: 1900, per100 }, // 1900, on target
  ]);
  const s = periodStats(totals, '2026-03-07', 7, 2000);

  it('averages over logged days only', () => {
    expect(s.daysLogged).toBe(3);
    expect(s.avg.kcal).toBeCloseTo((2000 + 2500 + 1900) / 3);
    expect(s.avg.protein).toBeCloseTo((200 + 250 + 190) / 3);
  });
  it('counts days within 10 % of the target', () => {
    expect(s.daysOnTarget).toBe(2);
  });
  it('builds a full series with gaps', () => {
    expect(s.series).toHaveLength(7);
    expect(s.series[0]).toEqual({ date: '2026-03-01', kcal: null });
    expect(s.series[6]).toEqual({ date: '2026-03-07', kcal: 2000 });
  });
  it('reports the streak', () => {
    expect(s.streak).toBe(2);
  });
  it('returns zeros without data', () => {
    const e = periodStats(new Map(), '2026-03-07', 30, 2000);
    expect(e.daysLogged).toBe(0);
    expect(e.avg.kcal).toBe(0);
  });
});

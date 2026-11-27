import { describe, expect, it } from 'vitest';
import { addDays } from '../date';
import { movingAverage, sortByDate, weeklyTrend } from './weight';

describe('movingAverage', () => {
  it('averages over a 7-day calendar window, not 7 points', () => {
    const pts = [
      { date: '2026-01-01', kg: 80 },
      { date: '2026-01-02', kg: 82 },
      { date: '2026-01-07', kg: 81 },
      { date: '2026-01-08', kg: 79 },
    ];
    const ma = movingAverage(pts);
    expect(ma.map((p) => p.kg)).toEqual([80, 81, 81, (82 + 81 + 79) / 3]);
  });
  it('handles an empty list', () => {
    expect(movingAverage([])).toEqual([]);
  });
});

describe('weeklyTrend', () => {
  it('finds a steady loss of 0.5 kg per week', () => {
    const pts = Array.from({ length: 21 }, (_, i) => ({
      date: addDays('2026-02-01', i),
      kg: 80 - (0.5 / 7) * i,
    }));
    expect(weeklyTrend(pts)).toBeCloseTo(-0.5, 5);
  });
  it('ignores old data outside the span', () => {
    const old = { date: '2025-01-01', kg: 100 };
    const recent = Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-02-01', i), kg: 70 }));
    expect(weeklyTrend([old, ...recent])).toBeCloseTo(0, 5);
  });
  it('needs enough data', () => {
    expect(weeklyTrend([{ date: '2026-01-01', kg: 80 }])).toBeNull();
    expect(
      weeklyTrend([
        { date: '2026-01-01', kg: 80 },
        { date: '2026-01-02', kg: 80 },
        { date: '2026-01-03', kg: 79 },
      ]),
    ).toBeNull();
  });
});

it('sortByDate sorts ascending without mutating', () => {
  const input = [
    { date: '2026-01-03', kg: 1 },
    { date: '2026-01-01', kg: 2 },
  ];
  expect(sortByDate(input).map((p) => p.date)).toEqual(['2026-01-01', '2026-01-03']);
  expect(input[0]!.date).toBe('2026-01-03');
});

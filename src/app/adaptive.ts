/** Real expenditure measured from logged meals and weigh-ins. */
import * as db from '../lib/db';
import { addDays, diffDays, type ISODate } from '../lib/date';
import { fmtInt } from '../lib/format';
import { ADAPTIVE_WINDOW, estimateTdee, type AdaptiveResult } from '../lib/nutrition/adaptive';
import { dailyTotals } from '../lib/nutrition/stats';
import { computeTargets, effectiveTargets } from '../lib/nutrition/targets';
import type { Nutrients } from '../lib/nutrition/types';
import { ensureWeights, saveProfile } from './actions';
import { showToast, store } from './store';

// Adaptive expenditure ----------------------------------------------------------

let adaptiveRun: Promise<AdaptiveResult | null> | null = null;

/**
 * Estimates the real expenditure from the last 4 weeks. In adaptive mode, applies it
 * to the targets at most once a week (and only with enough data).
 */
export function refreshAdaptive(): Promise<AdaptiveResult | null> {
  adaptiveRun ??= (async () => {
    const s0 = store.get();
    if (!s0.profile) return null;
    const end = addDays(s0.today, -1);
    const from = addDays(end, -(ADAPTIVE_WINDOW - 1));
    const [stored, weights] = await Promise.all([db.entriesInRange(from, end).catch(() => []), ensureWeights()]);
    const s = store.get();
    const p = s.profile;
    if (!p) return null;
    const inMemory = Object.entries(s.days)
      .filter(([d]) => d >= from && d <= end)
      .flatMap(([, l]) => l);
    const merged = stored.filter((e) => !s.days[e.date]).concat(inMemory);
    const totals = dailyTotals(merged);
    const dailyKcal = new Map([...totals].map(([d, n]: [ISODate, Nutrients]) => [d, n.kcal]));
    const r = estimateTdee({
      dailyKcal,
      weights,
      end,
      formulaTdee: computeTargets(p, s.today).formulaTdee,
      targetKcal: effectiveTargets(p, s.today).kcal,
    });
    store.set({ adaptive: r });
    if (p.adaptive && r.ok && r.estimate.confidence !== 'low') {
      const prev = p.adaptiveTdee;
      if (!prev || diffDays(prev.on, s.today) >= 7) {
        if (!prev || Math.abs(prev.kcal - r.estimate.tdee) >= 20) {
          saveProfile({ ...p, adaptiveTdee: { kcal: r.estimate.tdee, on: s.today } });
          showToast(`Objectifs ajustés : dépense réelle ${fmtInt(r.estimate.tdee)} kcal`);
        } else {
          saveProfile({ ...p, adaptiveTdee: { ...prev, on: s.today } });
        }
      }
    }
    return r;
  })().finally(() => {
    adaptiveRun = null;
  });
  return adaptiveRun;
}

export function setAdaptive(on: boolean): void {
  const s = store.get();
  const p = s.profile;
  if (!p) return;
  const r = s.adaptive;
  if (on && r?.ok) {
    saveProfile({ ...p, adaptive: true, adaptiveTdee: { kcal: r.estimate.tdee, on: s.today } });
    showToast(`Objectifs calculés sur ta dépense réelle : ${fmtInt(r.estimate.tdee)} kcal`);
  } else {
    saveProfile({ ...p, adaptive: on });
  }
}

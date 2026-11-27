import { useEffect, useState } from 'preact/hooks';
import { ensureWeights } from '../../app/actions';
import { savePrefs } from '../../app/water';
import { useStore } from '../../app/store';
import { entriesInRange, waterInRange } from '../../lib/db';
import { addDays, shortDayLabel, type ISODate } from '../../lib/date';
import { fmtDec, fmtInt, fmtSigned } from '../../lib/format';
import { dailyTotals } from '../../lib/nutrition/stats';
import { effectiveTargets } from '../../lib/nutrition/targets';
import type { Profile } from '../../lib/nutrition/types';
import { weekReview, type WeekReview } from '../../lib/nutrition/weekly';
import { Icon } from '../../ui/Icon';

/** Summary of a past week: shown on Monday in the journal, always available in Stats. */
export default function WeeklyReview({
  profile,
  weekStart,
  dismissible = false,
}: {
  profile: Profile;
  weekStart: ISODate;
  dismissible?: boolean;
}) {
  const today = useStore((s) => s.today);
  const days = useStore((s) => s.days);
  const [review, setReview] = useState<WeekReview | null>(null);

  useEffect(() => {
    let alive = true;
    const end = addDays(weekStart, 6);
    void Promise.all([
      entriesInRange(weekStart, end).catch(() => []),
      ensureWeights(),
      waterInRange(weekStart, end).catch(() => []),
    ]).then(([entries, weights, water]) => {
      if (!alive) return;
      const merged = entries.filter((e) => !days[e.date]).concat(
        ...Object.entries(days)
          .filter(([d]) => d >= weekStart && d <= end)
          .map(([, l]) => l),
      );
      const direction = profile.goal === 'lose' ? -1 : profile.goal === 'gain' ? 1 : 0;
      setReview(
        weekReview({
          start: weekStart,
          totals: dailyTotals(merged),
          weights,
          water: new Map(water.map((w) => [w.date, w.ml])),
          targets: effectiveTargets(profile, today),
          direction,
        }),
      );
    });
    return () => {
      alive = false;
    };
  }, [weekStart, days, profile, today]);

  if (!review || (review.daysLogged === 0 && review.weighIns === 0)) return null;
  const targets = effectiveTargets(profile, today);

  return (
    <section class="card review" aria-labelledby="review-h">
      <div class="card__head">
        <div class="review__titles">
          <p class="preview__label">Bilan de la semaine</p>
          <h2 class="card__title" id="review-h">
            Du {shortDayLabel(review.start)} au {shortDayLabel(review.end)}
          </h2>
        </div>
        {dismissible && (
          <button
            type="button"
            class="icon-btn icon-btn--filled"
            aria-label="Fermer le bilan de la semaine"
            onClick={() => savePrefs({ reviewDismissed: weekStart })}
          >
            <Icon name="close" size={16} stroke={2.4} />
          </button>
        )}
      </div>
      <ul class="review__highlights">
        {review.highlights.map((h) => (
          <li key={h}>
            <Icon name="sparkle" size={18} />
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <div class="tiles">
        <div class="tile">
          <span class="tile__label">Jours notés</span>
          <span class="tile__value">
            {review.daysLogged} <small>/ 7</small>
          </span>
        </div>
        <div class="tile">
          <span class="tile__label">Poids moyen</span>
          <span class="tile__value">
            {review.weightChange == null ? '0' : fmtSigned(review.weightChange)} <small>kg</small>
          </span>
        </div>
        <div class="tile">
          <span class="tile__label">Protéines OK</span>
          <span class="tile__value">
            {review.proteinDays} <small>j</small>
          </span>
        </div>
        <div class="tile">
          <span class="tile__label">Calories moy.</span>
          <span class="tile__value">{review.avgKcal == null ? '0' : fmtInt(review.avgKcal)}</span>
          <span class="tile__hint">cible {fmtInt(targets.kcal)}</span>
        </div>
        <div class="tile">
          <span class="tile__label">Dans la cible</span>
          <span class="tile__value">
            {review.daysOnTarget} <small>j</small>
          </span>
        </div>
        <div class="tile">
          <span class="tile__label">Eau moy.</span>
          <span class="tile__value">
            {review.waterAvgMl == null ? '0' : fmtDec(Math.round(review.waterAvgMl / 100) / 10)} <small>L</small>
          </span>
        </div>
      </div>
      {review.weightChange == null && (
        <p class="footnote">Le poids moyen se compare avec la semaine d'avant : pèse-toi au moins une fois par semaine.</p>
      )}
    </section>
  );
}

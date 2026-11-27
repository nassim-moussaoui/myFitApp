import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '../../app/store';
import { entriesInRange } from '../../lib/db';
import type { Entry } from '../../lib/db/schema';
import { addDays, shortDayLabel } from '../../lib/date';
import { fmtInt } from '../../lib/format';
import { dailyTotals, periodStats, type PeriodStats } from '../../lib/nutrition/stats';
import { effectiveTargets } from '../../lib/nutrition/targets';
import type { Profile } from '../../lib/nutrition/types';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Macros } from '../../ui/Progress';

export default function StatsScreen({ profile }: { profile: Profile }) {
  const today = useStore((s) => s.today);
  const days = useStore((s) => s.days);
  const [period, setPeriod] = useState<7 | 30>(7);
  const [stored, setStored] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    void entriesInRange(addDays(today, -59), today)
      .catch(() => [] as Entry[])
      .then((l) => alive && setStored(l));
    return () => {
      alive = false;
    };
  }, [today]);

  const targets = effectiveTargets(profile, today);
  const stats = useMemo(() => {
    if (!stored) return null;
    // Days loaded in memory are the source of truth (writes to IndexedDB are asynchronous).
    const merged = stored.filter((e) => !days[e.date]).concat(...Object.values(days));
    return periodStats(dailyTotals(merged), today, period, targets.kcal, today);
  }, [stored, days, today, period, targets.kcal]);

  const pct = stats && targets.kcal > 0 ? Math.round((stats.avg.kcal / targets.kcal) * 100) : 0;

  return (
    <>
      <header class="page-header">
        <h1 class="page-title">Stats</h1>
      </header>
      <main class="page" id="main">
        <Segmented
          legend="Période"
          hideLegend
          value={period}
          onChange={setPeriod}
          options={[
            { value: 7, label: '7 derniers jours' },
            { value: 30, label: '30 derniers jours' },
          ]}
        />
        {!stats ? (
          <div class="skeleton skeleton--block" aria-hidden="true" />
        ) : stats.daysLogged === 0 ? (
          <div class="card empty">
            <span class="empty__icon" aria-hidden="true">
              <Icon name="stats" size={22} />
            </span>
            <p class="empty__title">Pas encore de données</p>
            <p class="empty__text">Note tes repas dans le Journal : moyennes et régularité s'afficheront ici.</p>
          </div>
        ) : (
          <>
            <section class="card" aria-labelledby="s-avg">
              <div class="card__head">
                <h2 class="card__title" id="s-avg">
                  Moyenne par jour suivi
                </h2>
                <span class={`pill ${pct >= 90 && pct <= 110 ? 'pill--accent' : ''}`}>{pct} %</span>
              </div>
              <p class="hero-num">
                <span class="hero-num__value">{fmtInt(stats.avg.kcal)}</span>{' '}
                <span class="hero-num__unit">kcal sur {fmtInt(targets.kcal)}</span>
              </p>
              <hr class="divider" />
              <Macros value={stats.avg} target={targets} />
            </section>

            <section class="card" aria-labelledby="s-reg">
              <h2 class="card__title" id="s-reg">
                Régularité
              </h2>
              <div class="tiles regularity">
                <div class="tile">
                  <span class="tile__label">Jours suivis</span>
                  <span class="tile__value">
                    {stats.daysLogged} <small>/ {stats.days}</small>
                  </span>
                </div>
                <div class="tile">
                  <span class="tile__label">Série</span>
                  <span class="tile__value">
                    {stats.streak} <small>j</small>
                  </span>
                </div>
                <div class="tile">
                  <span class="tile__label">Dans la cible</span>
                  <span class="tile__value">
                    {stats.daysOnTarget} <small>j</small>
                  </span>
                </div>
              </div>
              <p class="footnote">« Dans la cible » : à plus ou moins 10 % de ton objectif calorique.</p>
            </section>

            <section class="card" aria-labelledby="s-chart">
              <h2 class="card__title" id="s-chart">
                Calories par jour
              </h2>
              <KcalBars stats={stats} target={targets.kcal} />
              <p class="legend">
                <span class="legend__item">
                  <span class="legend__bar" aria-hidden="true" /> Calories
                </span>
                <span class="legend__item">
                  <span class="legend__target" aria-hidden="true" /> Objectif
                </span>
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}

const W = 340;
const H = 170;
const PAD = { top: 12, right: 4, bottom: 24, left: 4 };

function KcalBars({ stats, target }: { stats: PeriodStats; target: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(target * 1.25, ...stats.series.map((s) => s.kcal ?? 0));
  const n = stats.series.length;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const slot = iw / n;
  const gap = n > 10 ? 2 : 6;
  const bw = Math.max(2, slot - gap);
  const y = (v: number) => PAD.top + (1 - v / max) * ih;
  const base = PAD.top + ih;
  const h = hover != null ? stats.series[hover] : undefined;

  return (
    <div class="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Calories par jour sur ${n} jours, objectif ${fmtInt(target)} kcal. ${stats.daysLogged} jours suivis.`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((((e.clientX - r.left) / r.width) * W - PAD.left) / slot);
          setHover(i >= 0 && i < n ? i : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line class="chart__baseline" x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} />
        {stats.series.map((s, i) => {
          if (s.kcal == null) return null;
          const top = y(s.kcal);
          const hgt = Math.max(2, base - top);
          const r = Math.min(4, bw / 2, hgt);
          const x0 = PAD.left + i * slot + gap / 2;
          // Rounded top corners only: the bar stays anchored to the baseline.
          const d = `M${x0},${base}V${base - hgt + r}Q${x0},${base - hgt} ${x0 + r},${base - hgt}H${x0 + bw - r}Q${
            x0 + bw
          },${base - hgt} ${x0 + bw},${base - hgt + r}V${base}Z`;
          const over = target > 0 && s.kcal > target * 1.1;
          return (
            <path
              key={s.date}
              class={`chart__bar ${over ? 'chart__bar--over' : ''} ${hover === i ? 'chart__bar--hover' : ''}`}
              d={d}
            />
          );
        })}
        <line class="chart__target" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} />
        <text class="chart__axis" x={PAD.left} y={H - 6}>
          {shortDayLabel(stats.series[0]!.date)}
        </text>
        <text class="chart__axis" x={W - PAD.right} y={H - 6} text-anchor="end">
          {shortDayLabel(stats.series[n - 1]!.date)}
        </text>
      </svg>
      {h && (
        <div
          class="chart__tip"
          style={{ left: `${Math.min(Math.max(((PAD.left + (hover! + 0.5) * slot) / W) * 100, 18), 82)}%` }}
          aria-hidden="true"
        >
          <strong>{h.kcal == null ? 'Non suivi' : `${fmtInt(h.kcal)} kcal`}</strong>
          <span>{shortDayLabel(h.date)}</span>
        </div>
      )}
    </div>
  );
}

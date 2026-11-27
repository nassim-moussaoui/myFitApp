import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '../../app/store';
import { entriesInRange } from '../../lib/db';
import type { Entry } from '../../lib/db/schema';
import { addDays, shortDayLabel, type ISODate } from '../../lib/date';
import { fmtInt } from '../../lib/format';
import { dailyTotals, periodStats, type PeriodStats } from '../../lib/nutrition/stats';
import { effectiveTargets } from '../../lib/nutrition/targets';
import type { Profile } from '../../lib/nutrition/types';
import { Segmented } from '../../ui/controls';
import { MacroBar } from '../../ui/Progress';

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

  return (
    <>
      <header class="topbar">
        <h1 class="topbar__title">Stats</h1>
      </header>
      <main class="screen" id="main">
        <Segmented
          legend="Période"
          hideLegend
          value={period}
          onChange={setPeriod}
          options={[
            { value: 7, label: '7 jours' },
            { value: 30, label: '30 jours' },
          ]}
        />
        {!stats ? (
          <div class="card skeleton skeleton--block" aria-hidden="true" />
        ) : stats.daysLogged === 0 ? (
          <div class="card empty">
            <p>Pas encore de données sur cette période.</p>
            <p class="muted">Ajoute tes repas dans le Journal : moyennes et régularité s'afficheront ici.</p>
          </div>
        ) : (
          <>
            <section class="card" aria-labelledby="s-avg">
              <h2 class="card__title" id="s-avg">
                Moyenne par jour suivi
              </h2>
              <p class="big-num">
                {fmtInt(stats.avg.kcal)} <span>kcal</span>
              </p>
              <p class="muted small">
                {Math.round((stats.avg.kcal / targets.kcal) * 100)} % de ton objectif de {fmtInt(targets.kcal)} kcal
              </p>
              <div class="summary__macros">
                <MacroBar label="Protéines" kind="protein" value={stats.avg.protein} target={targets.protein} />
                <MacroBar label="Glucides" kind="carbs" value={stats.avg.carbs} target={targets.carbs} />
                <MacroBar label="Lipides" kind="fat" value={stats.avg.fat} target={targets.fat} />
              </div>
            </section>

            <section class="card" aria-labelledby="s-reg">
              <h2 class="card__title" id="s-reg">
                Régularité
              </h2>
              <dl class="kv">
                <div>
                  <dt>Jours suivis</dt>
                  <dd>
                    {stats.daysLogged} / {stats.days}
                  </dd>
                </div>
                <div>
                  <dt>Série en cours</dt>
                  <dd>
                    {stats.streak} jour{stats.streak > 1 ? 's' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Dans l'objectif (±10 %)</dt>
                  <dd>
                    {stats.daysOnTarget} jour{stats.daysOnTarget > 1 ? 's' : ''}
                  </dd>
                </div>
              </dl>
            </section>

            <section class="card" aria-labelledby="s-chart">
              <h2 class="card__title" id="s-chart">
                Calories par jour
              </h2>
              <KcalBars stats={stats} target={targets.kcal} />
              <p class="legend">
                <span class="legend__bar" aria-hidden="true" /> Calories
                <span class="legend__target" aria-hidden="true" /> Objectif
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}

const W = 340;
const H = 160;
const PAD = { top: 10, right: 6, bottom: 22, left: 6 };

function KcalBars({ stats, target }: { stats: PeriodStats; target: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(target * 1.25, ...stats.series.map((s) => s.kcal ?? 0));
  const n = stats.series.length;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const slot = iw / n;
  const gap = 2;
  const bw = Math.max(2, slot - gap);
  const y = (v: number) => PAD.top + (1 - v / max) * ih;
  const base = PAD.top + ih;
  const label = (d: ISODate) => shortDayLabel(d);
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
          return <path key={s.date} class={`chart__bar ${hover === i ? 'chart__bar--hover' : ''}`} d={d} />;
        })}
        <line class="chart__target" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} />
        <text class="chart__axis" x={PAD.left} y={H - 5}>
          {label(stats.series[0]!.date)}
        </text>
        <text class="chart__axis" x={W - PAD.right} y={H - 5} text-anchor="end">
          {label(stats.series[n - 1]!.date)}
        </text>
      </svg>
      {h && (
        <div
          class="chart__tip"
          style={{ left: `${Math.min(Math.max(((PAD.left + (hover! + 0.5) * slot) / W) * 100, 18), 82)}%` }}
          aria-hidden="true"
        >
          <strong>{h.kcal == null ? 'Non suivi' : `${fmtInt(h.kcal)} kcal`}</strong>
          <span>{label(h.date)}</span>
        </div>
      )}
    </div>
  );
}

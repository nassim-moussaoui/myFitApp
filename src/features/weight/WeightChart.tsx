import { useMemo, useState } from 'preact/hooks';
import { diffDays, shortDayLabel } from '../../lib/date';
import { fmtKg } from '../../lib/format';
import type { WeightPoint } from '../../lib/nutrition/weight';

const W = 340;
const H = 190;
const PAD = { top: 12, right: 12, bottom: 26, left: 38 };

/** Hand-made SVG chart: daily weigh-ins (dots) and the 7-day moving average (line). */
export default function WeightChart({ points, ma }: { points: WeightPoint[]; ma: WeightPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (!points.length) return null;
    const first = points[0]!.date;
    const last = points[points.length - 1]!.date;
    const span = Math.max(1, diffDays(first, last));
    const kgs = points.map((p) => p.kg).concat(ma.map((p) => p.kg));
    let lo = Math.floor(Math.min(...kgs) - 0.5);
    let hi = Math.ceil(Math.max(...kgs) + 0.5);
    if (hi - lo < 2) {
      lo -= 1;
      hi += 1;
    }
    const iw = W - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const x = (d: string) => PAD.left + (points.length === 1 ? iw / 2 : (diffDays(first, d) / span) * iw);
    const y = (kg: number) => PAD.top + (1 - (kg - lo) / (hi - lo)) * ih;
    const stepKg = Math.max(1, Math.ceil((hi - lo) / 4));
    const ticks: number[] = [];
    for (let v = Math.ceil(lo); v <= hi; v += stepKg) ticks.push(v);
    const line = ma.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join('');
    return { x, y, ticks, line, first, last };
  }, [points, ma]);

  if (!geo) return null;
  const { x, y, ticks, line, first, last } = geo;
  const lastMa = ma[ma.length - 1];
  const summary = `Courbe du poids du ${shortDayLabel(first)} au ${shortDayLabel(last)} : ${points.length} pesées${
    lastMa ? `, moyenne 7 jours actuelle ${fmtKg(lastMa.kg)} kg` : ''
  }.`;

  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.date) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover != null ? points[hover] : undefined;
  const hma = hp ? ma.find((m) => m.date === hp.date) : undefined;
  const tipLeft = hp ? Math.min(Math.max((x(hp.date) / W) * 100, 18), 82) : 0;

  return (
    <div class="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t} class="chart__grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 6} y={y(t)} dy="0.32em" text-anchor="end">
              {t}
            </text>
          </g>
        ))}
        <text class="chart__axis" x={PAD.left} y={H - 6}>
          {shortDayLabel(first)}
        </text>
        {first !== last && (
          <text class="chart__axis" x={W - PAD.right} y={H - 6} text-anchor="end">
            {shortDayLabel(last)}
          </text>
        )}
        {points.map((p) => (
          <circle key={p.date} class="chart__dot" cx={x(p.date)} cy={y(p.kg)} r={points.length > 120 ? 2.5 : 4} />
        ))}
        {ma.length > 1 && <path class="chart__line" d={line} />}
        {hp && (
          <g class="chart__hover">
            <line x1={x(hp.date)} x2={x(hp.date)} y1={PAD.top} y2={H - PAD.bottom} />
            <circle cx={x(hp.date)} cy={y(hp.kg)} r={6} />
          </g>
        )}
      </svg>
      {hp && (
        <div class="chart__tip" style={{ left: `${tipLeft}%` }} aria-hidden="true">
          <strong>{fmtKg(hp.kg)} kg</strong>
          <span>{shortDayLabel(hp.date)}</span>
          {hma && <span>Moy. 7 j : {fmtKg(hma.kg)} kg</span>}
        </div>
      )}
    </div>
  );
}

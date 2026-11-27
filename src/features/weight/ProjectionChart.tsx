import { useMemo, useState } from 'preact/hooks';
import { addDays, diffDays, shortDayLabel, type ISODate } from '../../lib/date';
import { fmtKg } from '../../lib/format';
import { etaDate, projectKg } from '../../lib/nutrition/goals';
import type { WeightPoint } from '../../lib/nutrition/weight';

const W = 340;
const H = 200;
const PAD = { top: 16, right: 14, bottom: 26, left: 36 };

export interface ProjectionChartProps {
  /** Raw weigh-ins inside the window. */
  history: WeightPoint[];
  /** 7-day moving average inside the window. */
  ma: WeightPoint[];
  /** Where the projection starts (latest weigh-in). */
  anchor: WeightPoint;
  /** Planned change in kg per week (signed). */
  rate: number;
  finalKg: number | null;
  milestoneKg: number | null;
  start: ISODate;
  end: ISODate;
  today: ISODate;
}

/** History on the left, dashed projection on the right, milestone and final targets as reference lines. */
export default function ProjectionChart(p: ProjectionChartProps) {
  const [hover, setHover] = useState<ISODate | null>(null);

  const geo = useMemo(() => {
    const span = Math.max(1, diffDays(p.start, p.end));
    const iw = W - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const x = (d: ISODate) => PAD.left + (Math.min(span, Math.max(0, diffDays(p.start, d))) / span) * iw;

    // Projection polyline: anchor, arrival on the final target (if within range), end.
    const proj: WeightPoint[] = [p.anchor];
    const eta = p.finalKg != null ? etaDate(p.anchor, p.rate, p.finalKg) : null;
    if (eta && eta > p.anchor.date && eta < p.end) proj.push({ date: eta, kg: p.finalKg! });
    if (p.end > p.anchor.date) proj.push({ date: p.end, kg: projectKg(p.anchor, p.rate, p.end, p.finalKg) });

    const kgs = [...p.history, ...p.ma, ...proj].map((q) => q.kg);
    if (p.milestoneKg != null) kgs.push(p.milestoneKg);
    const lastProj = proj[proj.length - 1]!.kg;
    // Show the final target only when it is near the visible range, to keep the scale readable.
    const showFinal = p.finalKg != null && (eta != null && eta <= p.end ? true : Math.abs(p.finalKg - lastProj) <= 2.5);
    if (showFinal) kgs.push(p.finalKg!);
    let lo = Math.floor(Math.min(...kgs) - 0.6);
    let hi = Math.ceil(Math.max(...kgs) + 0.6);
    if (hi - lo < 3) {
      lo -= 1;
      hi += 1;
    }
    const y = (kg: number) => PAD.top + (1 - (kg - lo) / (hi - lo)) * ih;
    const step = Math.max(1, Math.ceil((hi - lo) / 4));
    const ticks: number[] = [];
    for (let v = Math.ceil(lo); v <= hi; v += step) ticks.push(v);
    const path = (pts: WeightPoint[]) =>
      pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.date).toFixed(1)},${y(q.kg).toFixed(1)}`).join('');
    return { x, y, ticks, proj, showFinal, eta, maPath: path(p.ma), projPath: path(proj), span, iw };
  }, [p.history, p.ma, p.anchor, p.rate, p.finalKg, p.milestoneKg, p.start, p.end]);

  const { x, y, ticks, proj, showFinal, maPath, projPath, span, iw } = geo;
  const end = proj[proj.length - 1]!;

  // Reference lines; nudge the second label down when both are close.
  const refs: { kg: number; label: string; cls: string }[] = [];
  if (p.milestoneKg != null) refs.push({ kg: p.milestoneKg, label: `Palier ${fmtKg(p.milestoneKg)}`, cls: 'chart__ref--milestone' });
  if (showFinal && p.finalKg != null && p.finalKg !== p.milestoneKg) {
    refs.push({ kg: p.finalKg, label: `Objectif ${fmtKg(p.finalKg)}`, cls: 'chart__ref--final' });
  }
  const refLabelY = refs.map((r) => y(r.kg) - 5);
  if (refs.length === 2 && Math.abs(refLabelY[0]! - refLabelY[1]!) < 13) refLabelY[1] = y(refs[1]!.kg) + 13;

  const valueAt = (d: ISODate): { kg: number; estimate: boolean } | null => {
    if (d > p.anchor.date) return { kg: projectKg(p.anchor, p.rate, d, p.finalKg), estimate: true };
    const exact = p.history.find((h) => h.date === d);
    if (exact) return { kg: exact.kg, estimate: false };
    const m = p.ma.find((h) => h.date === d);
    return m ? { kg: m.kg, estimate: false } : null;
  };
  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const d = addDays(p.start, Math.round(((px - PAD.left) / iw) * span));
    setHover(d < p.start ? p.start : d > p.end ? p.end : d);
  };
  const hv = hover ? valueAt(hover) : null;
  const tipLeft = hover ? Math.min(Math.max((x(hover) / W) * 100, 20), 80) : 0;

  const summary = `Projection du poids : ${fmtKg(p.anchor.kg)} kg aujourd'hui, environ ${fmtKg(end.kg)} kg le ${shortDayLabel(
    end.date,
  )}.`;

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

        {/* Future zone */}
        <rect
          class="chart__future"
          x={x(p.today)}
          y={PAD.top}
          width={Math.max(0, W - PAD.right - x(p.today))}
          height={H - PAD.top - PAD.bottom}
        />
        <line class="chart__today" x1={x(p.today)} x2={x(p.today)} y1={PAD.top} y2={H - PAD.bottom} />

        {refs.map((r, i) => (
          <g key={r.label} class={`chart__ref ${r.cls}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(r.kg)} y2={y(r.kg)} />
            <text x={W - PAD.right - 14} y={refLabelY[i]} text-anchor="end">
              {r.label}
            </text>
          </g>
        ))}

        {p.history.map((h) => (
          <circle key={h.date} class="chart__dot" cx={x(h.date)} cy={y(h.kg)} r={3} />
        ))}
        {p.ma.length > 1 && <path class="chart__line" d={maPath} />}
        {proj.length > 1 && <path class="chart__proj" d={projPath} />}
        <circle class="chart__anchor" cx={x(p.anchor.date)} cy={y(p.anchor.kg)} r={5} />
        {proj.length > 1 && <circle class="chart__end" cx={x(end.date)} cy={y(end.kg)} r={5} />}

        <text class="chart__axis" x={PAD.left} y={H - 6}>
          {shortDayLabel(p.start)}
        </text>
        {diffDays(p.start, p.today) > 6 && diffDays(p.today, p.end) > 10 && (
          <text class="chart__axis" x={x(p.today)} y={H - 6} text-anchor="middle">
            Auj.
          </text>
        )}
        <text class="chart__axis" x={W - PAD.right} y={H - 6} text-anchor="end">
          {shortDayLabel(p.end)}
        </text>

        {hover && hv && (
          <g class="chart__hover">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} />
            <circle cx={x(hover)} cy={y(hv.kg)} r={5} />
          </g>
        )}
      </svg>
      {hover && hv && (
        <div class="chart__tip" style={{ left: `${tipLeft}%` }} aria-hidden="true">
          <strong>
            {hv.estimate ? '≈ ' : ''}
            {fmtKg(hv.kg)} kg
          </strong>
          <span>
            {shortDayLabel(hover)}
            {hv.estimate ? ' · estimation' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

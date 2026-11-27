import { fmtInt } from '../lib/format';

/** Calorie ring. Pure SVG; only the label changes, no stroke animation. */
export function Ring({ value, target, size = 144 }: { value: number; target: number; size?: number }) {
  const stroke = 13;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = target > 0 ? Math.min(value / target, 1) : 0;
  const over = target > 0 && value > target;
  const remaining = Math.round(target - value);
  return (
    <div class="ring" style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle class="ring__track" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} fill="none" />
        <circle
          class={`ring__value ${over ? 'ring__value--over' : ''}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke-width={stroke}
          fill="none"
          stroke-linecap="round"
          stroke-dasharray={`${c} ${c}`}
          stroke-dashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={ratio === 0 ? 0 : 1}
        />
      </svg>
      <div class="ring__label">
        <span class="ring__num">{fmtInt(Math.abs(remaining))}</span>
        <span class="ring__unit">{over ? 'kcal en trop' : 'kcal restantes'}</span>
      </div>
    </div>
  );
}

export type MacroKind = 'protein' | 'carbs' | 'fat';

export const MACRO_LABEL: Record<MacroKind, string> = {
  protein: 'Protéines',
  carbs: 'Glucides',
  fat: 'Lipides',
};

export function Macro({ kind, value, target }: { kind: MacroKind; value: number; target: number }) {
  const ratio = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div class="macro">
      <span class="macro__label">
        <span class={`macro__dot bg-${kind}`} aria-hidden="true" />
        {MACRO_LABEL[kind]}
      </span>
      <span class="macro__val">
        {fmtInt(value)} <span>/ {fmtInt(target)} g</span>
      </span>
      <div class="bar" aria-hidden="true">
        <div class={`bar__fill bg-${kind}`} style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

export function Macros({
  value,
  target,
}: {
  value: { protein: number; carbs: number; fat: number };
  target: { protein: number; carbs: number; fat: number };
}) {
  return (
    <div class="macros">
      <Macro kind="protein" value={value.protein} target={target.protein} />
      <Macro kind="carbs" value={value.carbs} target={target.carbs} />
      <Macro kind="fat" value={value.fat} target={target.fat} />
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <ul class="list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li class="row row--skeleton" key={i}>
          <span class="thumb skeleton" />
          <span class="row__main" style={{ gap: '0.5rem' }}>
            <span class="skeleton skeleton--line" />
            <span class="skeleton skeleton--line skeleton--short" />
          </span>
        </li>
      ))}
    </ul>
  );
}

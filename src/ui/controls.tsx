import type { ComponentChildren, InputHTMLAttributes, PartialInputHTMLAttributes } from 'preact';
import { useId } from 'preact/hooks';

interface SegmentedProps<T extends string | number> {
  legend: string;
  hideLegend?: boolean;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  name?: string;
}

/** Radio group styled as a segmented control (native keyboard and VoiceOver support). */
export function Segmented<T extends string | number>(p: SegmentedProps<T>) {
  const id = useId();
  return (
    <fieldset class="segmented">
      <legend class={p.hideLegend ? 'sr-only' : 'field__label'}>{p.legend}</legend>
      <div class="segmented__track">
        {p.options.map((o) => (
          <label class="segmented__opt" key={String(o.value)}>
            <input
              type="radio"
              name={p.name ?? id}
              value={String(o.value)}
              checked={o.value === p.value}
              onChange={() => p.onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type FieldProps = Omit<PartialInputHTMLAttributes<HTMLInputElement>, 'label' | 'onInput' | 'value'> & {
  label: string;
  value: string;
  onValue: (v: string) => void;
  suffix?: string;
  hint?: ComponentChildren;
  error?: string | null;
  decimal?: boolean;
};

/** Labelled input. `decimal` shows the iOS decimal pad and keeps 16px text (no auto-zoom). */
export function Field({ label, value, onValue, suffix, hint, error, decimal, id: idProp, ...rest }: FieldProps) {
  const auto = useId();
  const id = (idProp as string | undefined) ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const described = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div class={`field ${error ? 'field--error' : ''}`}>
      <label class="field__label" for={id}>
        {label}
      </label>
      <div class="field__control">
        <input
          id={id}
          class="input"
          value={value}
          onInput={(e) => onValue(e.currentTarget.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          {...((decimal
            ? { inputMode: 'decimal', autoComplete: 'off', enterKeyHint: 'done', type: 'text', ...rest }
            : rest) as InputHTMLAttributes<HTMLInputElement>)}
        />
        {suffix && (
          <span class="field__suffix" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p class="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p class="field__error" id={errId}>
          {error}
        </p>
      )}
    </div>
  );
}

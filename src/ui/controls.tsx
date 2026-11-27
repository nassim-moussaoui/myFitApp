import type { ComponentChildren, InputHTMLAttributes, PartialInputHTMLAttributes } from 'preact';
import { useId } from 'preact/hooks';
import { Icon } from './Icon';

interface SegmentedProps<T extends string | number> {
  legend: string;
  hideLegend?: boolean;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  name?: string;
}

/** Radio group styled as an iOS segmented control (native keyboard and VoiceOver support). */
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

type InputProps = Omit<PartialInputHTMLAttributes<HTMLInputElement>, 'label' | 'onInput' | 'value'>;

type FieldProps = InputProps & {
  label: string;
  value: string;
  onValue: (v: string) => void;
  suffix?: string;
  hint?: ComponentChildren;
  error?: string | null;
  decimal?: boolean;
};

const decimalProps = { inputMode: 'decimal', autoComplete: 'off', enterKeyHint: 'done', type: 'text' } as const;
const numericProps = { inputMode: 'numeric', autoComplete: 'off', enterKeyHint: 'done', type: 'text' } as const;

/** Labelled input. `decimal` shows the iOS decimal pad and keeps 16px+ text (no auto-zoom). */
export function Field({ label, value, onValue, suffix, hint, error, decimal, id: idProp, ...rest }: FieldProps) {
  const auto = useId();
  const id = (idProp as string | undefined) ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const described = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div class="field">
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
          {...((decimal ? { ...decimalProps, ...rest } : rest) as InputHTMLAttributes<HTMLInputElement>)}
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

/** Settings-style row: label on the left, compact numeric input on the right. */
export function RowField({
  label,
  hint,
  value,
  onValue,
  suffix,
  error,
  decimal = true,
}: {
  label: string;
  hint?: string;
  value: string;
  onValue: (v: string) => void;
  suffix: string;
  error?: string | null;
  decimal?: boolean;
}) {
  const id = useId();
  return (
    <div class="row-field">
      <label class="row-field__label" for={id}>
        <span>{label}</span>
        {error ? (
          <span class="row-field__error" id={`${id}-err`}>
            {error}
          </span>
        ) : (
          hint && <small>{hint}</small>
        )}
      </label>
      <div class="row-field__control">
        <input
          id={id}
          class="input"
          value={value}
          onInput={(e) => onValue(e.currentTarget.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          {...(decimal ? decimalProps : numericProps)}
        />
        <span class="field__suffix" aria-hidden="true">
          {suffix}
        </span>
      </div>
    </div>
  );
}

/** iOS-style switch on a native checkbox (role="switch"). */
export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div class="row-field">
      <label class="row-field__label" for={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
      <span class="switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        <span class="switch__track" aria-hidden="true" />
        <span class="switch__thumb" aria-hidden="true" />
      </span>
    </div>
  );
}

/** Radio row with a check mark, for short single-choice lists. */
export function Choice({
  name,
  checked,
  onChange,
  title,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <label class="choice">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span class="choice__text">
        <span class="choice__title">{title}</span>
        {hint && <span class="choice__hint">{hint}</span>}
      </span>
      <span class="choice__mark" aria-hidden="true">
        <Icon name="check" size={14} stroke={3} />
      </span>
    </label>
  );
}

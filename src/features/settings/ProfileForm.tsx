import { useMemo, useState } from 'preact/hooks';
import { isValidISODate, todayISO } from '../../lib/date';
import { fmtInt, parseDecimal, toInputString } from '../../lib/format';
import {
  ACTIVITY_LEVELS,
  DEFAULT_FAT_PER_KG,
  DEFAULT_PROTEIN_PER_KG,
  DEFAULT_RATE,
  GOALS,
  RATES,
  computeTargets,
} from '../../lib/nutrition/targets';
import type { ActivityLevel, Goal, Profile, Sex } from '../../lib/nutrition/types';
import { Field, Segmented } from '../../ui/controls';

interface Props {
  initial?: Profile | null;
  submitLabel: string;
  onSubmit: (p: Profile) => void;
}

type Errors = Partial<Record<'age' | 'birthDate' | 'height' | 'weight', string>>;

const rateLabel = (goal: Goal, r: number) =>
  `${goal === 'lose' ? '-' : '+'}${toInputString(r, 2)} kg`;

export function ProfileForm({ initial, submitLabel, onSubmit }: Props) {
  const today = todayISO();
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'male');
  const [useBirth, setUseBirth] = useState(!!initial?.birthDate);
  const [age, setAge] = useState(initial?.age != null ? String(computeAge(initial, today)) : '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '');
  const [height, setHeight] = useState(toInputString(initial?.heightCm, 0));
  const [weight, setWeight] = useState(toInputString(initial?.weightKg));
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity ?? 'light');
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'lose');
  const [rate, setRate] = useState<number>(initial?.rateKgPerWeek ?? DEFAULT_RATE.lose);
  const [errors, setErrors] = useState<Errors>({});

  const parsed = useMemo(() => {
    const e: Errors = {};
    const a = parseDecimal(age);
    if (!useBirth && (a == null || a < 14 || a > 100 || !Number.isInteger(a))) e.age = 'Âge entre 14 et 100 ans.';
    if (useBirth) {
      if (!isValidISODate(birthDate) || birthDate > today) e.birthDate = 'Date de naissance invalide.';
    }
    const h = parseDecimal(height);
    if (h == null || h < 120 || h > 230) e.height = 'Taille entre 120 et 230 cm.';
    const w = parseDecimal(weight);
    if (w == null || w < 30 || w > 300) e.weight = 'Poids entre 30 et 300 kg.';
    if (Object.keys(e).length) return { errors: e, profile: null };
    const profile: Profile = {
      sex,
      heightCm: h!,
      weightKg: Math.round(w! * 10) / 10,
      activity,
      goal,
      rateKgPerWeek: goal === 'maintain' ? 0 : rate,
      proteinPerKg: initial?.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
      fatPerKg: initial?.fatPerKg ?? DEFAULT_FAT_PER_KG,
      override: initial?.override ?? null,
      updatedAt: Date.now(),
      ...(useBirth ? { birthDate } : { age: a!, ageRecordedOn: today }),
    };
    return { errors: e, profile };
  }, [sex, useBirth, age, birthDate, height, weight, activity, goal, rate, initial, today]);

  const preview = parsed.profile ? computeTargets(parsed.profile, today) : null;

  const pickGoal = (g: Goal) => {
    setGoal(g);
    if (!RATES[g].includes(rate)) setRate(DEFAULT_RATE[g]);
  };

  return (
    <form
      class="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        setErrors(parsed.errors);
        if (parsed.profile) onSubmit(parsed.profile);
        else {
          // Errors render on the next frame; move focus to the first invalid field.
          requestAnimationFrame(() =>
            form.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(),
          );
        }
      }}
    >
      <Segmented
        legend="Sexe"
        value={sex}
        onChange={setSex}
        options={[
          { value: 'male', label: 'Homme' },
          { value: 'female', label: 'Femme' },
        ]}
      />

      <div class="grid-2">
        {useBirth ? (
          <Field
            label="Date de naissance"
            type="date"
            value={birthDate}
            onValue={setBirthDate}
            max={today}
            error={errors.birthDate}
          />
        ) : (
          <Field
            label="Âge"
            value={age}
            onValue={setAge}
            suffix="ans"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            error={errors.age}
          />
        )}
        <Field label="Taille" value={height} onValue={setHeight} suffix="cm" decimal error={errors.height} />
      </div>
      <button type="button" class="link-btn" onClick={() => setUseBirth(!useBirth)}>
        {useBirth ? "Indiquer mon âge plutôt" : 'Indiquer ma date de naissance plutôt'}
      </button>

      <Field label="Poids actuel" value={weight} onValue={setWeight} suffix="kg" decimal error={errors.weight} />

      <fieldset class="choice-list">
        <legend class="field__label">Niveau d'activité</legend>
        {ACTIVITY_LEVELS.map((a) => (
          <label class="choice" key={a.id}>
            <input
              type="radio"
              name="activity"
              value={a.id}
              checked={activity === a.id}
              onChange={() => setActivity(a.id)}
            />
            <span class="choice__text">
              <span class="choice__title">{a.label}</span>
              <span class="choice__hint">{a.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Segmented
        legend="Objectif"
        value={goal}
        onChange={pickGoal}
        options={GOALS.map((g) => ({ value: g.id, label: g.label }))}
      />
      {goal !== 'maintain' && (
        <Segmented
          legend="Rythme par semaine"
          value={rate}
          onChange={setRate}
          options={RATES[goal].map((r) => ({ value: r, label: rateLabel(goal, r) }))}
        />
      )}

      <div class="preview" aria-live="polite">
        {preview ? (
          <>
            <p class="preview__main">
              Objectif : <strong>{fmtInt(preview.kcal)} kcal</strong> par jour
            </p>
            <p class="preview__sub">
              Protéines {fmtInt(preview.protein)} g, glucides {fmtInt(preview.carbs)} g, lipides {fmtInt(preview.fat)} g
            </p>
            {preview.clamped && (
              <p class="preview__warn">
                Rythme trop rapide pour ton profil : la cible est limitée à {fmtInt(preview.kcal)} kcal.
              </p>
            )}
          </>
        ) : (
          <p class="preview__sub">Remplis les champs pour voir ta cible.</p>
        )}
      </div>

      <button type="submit" class="btn btn--primary btn--block">
        {submitLabel}
      </button>
    </form>
  );
}

function computeAge(p: Profile, today: string): number {
  return computeTargets(p, today).age;
}

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
import { Choice, Field, Segmented } from '../../ui/controls';

interface Props {
  initial?: Profile | null;
  submitLabel: string;
  /** Pin the submit button above the home indicator (onboarding). */
  stickySubmit?: boolean;
  onSubmit: (p: Profile) => void;
}

type Errors = Partial<Record<'age' | 'birthDate' | 'height' | 'weight', string>>;

const rateLabel = (goal: Goal, r: number) => `${goal === 'lose' ? '-' : '+'}${toInputString(r, 2)} kg`;

export function ProfileForm({ initial, submitLabel, stickySubmit, onSubmit }: Props) {
  const today = todayISO();
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'male');
  const [useBirth, setUseBirth] = useState(!!initial?.birthDate);
  const [age, setAge] = useState(initial ? String(computeTargets(initial, today).age) : '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '');
  const [height, setHeight] = useState(toInputString(initial?.heightCm, 0));
  const [weight, setWeight] = useState(toInputString(initial?.weightKg));
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity ?? 'light');
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'lose');
  const [rate, setRate] = useState<number>(initial?.rateKgPerWeek || DEFAULT_RATE[initial?.goal ?? 'lose']);
  const [errors, setErrors] = useState<Errors>({});

  const parsed = useMemo(() => {
    const e: Errors = {};
    const a = parseDecimal(age);
    if (!useBirth && (a == null || a < 14 || a > 100 || !Number.isInteger(a))) e.age = 'Entre 14 et 100 ans.';
    if (useBirth && (!isValidISODate(birthDate) || birthDate > today)) e.birthDate = 'Date invalide.';
    const h = parseDecimal(height);
    if (h == null || h < 120 || h > 230) e.height = 'Entre 120 et 230 cm.';
    const w = parseDecimal(weight);
    if (w == null || w < 30 || w > 300) e.weight = 'Entre 30 et 300 kg.';
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

  const submit = (
    <button type="submit" class="btn btn--primary btn--block">
      {submitLabel}
    </button>
  );

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
          requestAnimationFrame(() => form.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
        }
      }}
    >
      <section class="group" aria-labelledby="pf-me">
        <h2 class="group-title" id="pf-me">
          Toi
        </h2>
        <div class="card">
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
          <Field label="Poids actuel" value={weight} onValue={setWeight} suffix="kg" decimal error={errors.weight} />
          <button type="button" class="link-btn" onClick={() => setUseBirth(!useBirth)}>
            {useBirth ? 'Indiquer mon âge plutôt' : 'Indiquer ma date de naissance plutôt'}
          </button>
        </div>
      </section>

      <section class="group" aria-labelledby="pf-act">
        <h2 class="group-title" id="pf-act">
          Activité
        </h2>
        <fieldset class="card choice-list" style={{ paddingBlock: '0.25rem' }}>
          <legend class="sr-only">Niveau d'activité</legend>
          {ACTIVITY_LEVELS.map((a) => (
            <Choice
              key={a.id}
              name="activity"
              checked={activity === a.id}
              onChange={() => setActivity(a.id)}
              title={a.label}
              hint={a.hint}
            />
          ))}
        </fieldset>
      </section>

      <section class="group" aria-labelledby="pf-goal">
        <h2 class="group-title" id="pf-goal">
          Objectif
        </h2>
        <div class="card">
          <Segmented
            legend="Objectif"
            hideLegend
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
        </div>
      </section>

      <section class="card preview" aria-live="polite" aria-label="Ton objectif quotidien">
        <p class="preview__label">Ton objectif quotidien</p>
        {preview ? (
          <>
            <p class="hero-num">
              <span class="hero-num__value">{fmtInt(preview.kcal)}</span>{' '}
              <span class="hero-num__unit">kcal par jour</span>
            </p>
            <div class="tiles">
              <div class="tile">
                <span class="tile__label">Protéines</span>
                <span class="tile__value">
                  {fmtInt(preview.protein)} <small>g</small>
                </span>
              </div>
              <div class="tile">
                <span class="tile__label">Glucides</span>
                <span class="tile__value">
                  {fmtInt(preview.carbs)} <small>g</small>
                </span>
              </div>
              <div class="tile">
                <span class="tile__label">Lipides</span>
                <span class="tile__value">
                  {fmtInt(preview.fat)} <small>g</small>
                </span>
              </div>
            </div>
            {preview.clamped && (
              <p class="preview__warn">Rythme trop rapide pour ton profil : la cible est relevée à un minimum sûr.</p>
            )}
          </>
        ) : (
          <p class="muted">Remplis âge, taille et poids pour voir ta cible.</p>
        )}
      </section>

      {stickySubmit ? <div class="bottom-cta">{submit}</div> : submit}
    </form>
  );
}

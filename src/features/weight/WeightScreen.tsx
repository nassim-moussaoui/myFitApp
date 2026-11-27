import { useEffect, useMemo, useState } from 'preact/hooks';
import { ensureWeights, removeWeight, saveProfile, saveWeight } from '../../app/actions';
import { lazy } from '../../app/lazy';
import { showToast, useStore } from '../../app/store';
import type { WeightEntry } from '../../lib/db/schema';
import { addDays, isValidISODate, longDayLabel, relativeDayLabel } from '../../lib/date';
import { fmtInt, fmtKg, fmtSigned, parseDecimal, toInputString } from '../../lib/format';
import { computeTargets } from '../../lib/nutrition/targets';
import type { Profile } from '../../lib/nutrition/types';
import { movingAverage, weeklyTrend } from '../../lib/nutrition/weight';
import { Field, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';

const WeightChart = lazy(
  () => import('./WeightChart'),
  () => <div class="chart chart--placeholder skeleton" aria-hidden="true" />,
);

type Range = 30 | 90 | 365 | 0;

const valid = (kg: number | null): kg is number => kg != null && kg >= 30 && kg <= 300;

export default function WeightScreen({ profile }: { profile: Profile }) {
  const weights = useStore((s) => s.weights);
  const today = useStore((s) => s.today);
  const [kgText, setKgText] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [prompt, setPrompt] = useState<number | null>(null);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [range, setRange] = useState<Range>(90);

  useEffect(() => {
    void ensureWeights();
  }, []);

  const list = weights ?? [];
  const last = list[list.length - 1];
  const shown = kgText ?? toInputString(last?.kg ?? profile.weightKg);
  const kg = parseDecimal(shown);
  const ma = useMemo(() => movingAverage(list), [list]);
  const trend = useMemo(() => weeklyTrend(list), [list]);
  const lastMa = ma[ma.length - 1];

  const step = (d: number) => {
    const base = valid(kg) ? kg : (last?.kg ?? profile.weightKg);
    setKgText(toInputString(Math.round((base + d) * 10) / 10));
  };

  const chartPoints = useMemo(() => {
    if (!range || !last) return { points: list, ma };
    const from = addDays(last.date, -(range - 1));
    return { points: list.filter((p) => p.date >= from), ma: ma.filter((p) => p.date >= from) };
  }, [list, ma, range, last]);

  const save = (e: Event) => {
    e.preventDefault();
    if (!valid(kg) || !isValidISODate(date) || date > today) return;
    const value = Math.round(kg * 10) / 10;
    saveWeight(date, value);
    setKgText(null);
    showToast(`Pesée enregistrée : ${fmtKg(value)} kg.`);
    const isLatest = !last || date >= last.date;
    if (isLatest && Math.abs(value - profile.weightKg) >= 0.1) setPrompt(value);
  };

  return (
    <>
      <header class="topbar">
        <h1 class="topbar__title">Poids</h1>
      </header>
      <main class="screen" id="main">
        <form class="card stack" onSubmit={save} aria-labelledby="w-new">
          <h2 class="card__title" id="w-new">
            Nouvelle pesée
          </h2>
          <div class="stepper">
            <button type="button" class="icon-btn stepper__btn" onClick={() => step(-0.1)} aria-label="Moins 0,1 kg">
              <Icon name="minus" />
            </button>
            <div class="stepper__field">
              <label for="w-kg" class="sr-only">
                Poids en kilos
              </label>
              <input
                id="w-kg"
                class="input stepper__input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                value={shown}
                onInput={(e) => setKgText(e.currentTarget.value)}
                aria-invalid={!valid(kg) ? true : undefined}
                aria-describedby="w-kg-err"
              />
              <span class="stepper__unit" aria-hidden="true">
                kg
              </span>
            </div>
            <button type="button" class="icon-btn stepper__btn" onClick={() => step(0.1)} aria-label="Plus 0,1 kg">
              <Icon name="plus" />
            </button>
          </div>
          <p id="w-kg-err" class="field__error" hidden={valid(kg)}>
            Poids entre 30 et 300 kg.
          </p>
          <Field label="Date" type="date" value={date} onValue={setDate} max={today} />
          <button type="submit" class="btn btn--primary btn--block" disabled={!valid(kg)}>
            Enregistrer
          </button>
        </form>

        {prompt != null && <UpdatePrompt profile={profile} kg={prompt} onDone={() => setPrompt(null)} />}

        {weights && list.length === 0 && (
          <div class="card empty">
            <p>Aucune pesée pour l'instant.</p>
            <p class="muted">Pèse-toi idéalement le matin, dans les mêmes conditions. La courbe et la tendance apparaîtront ici.</p>
          </div>
        )}

        {list.length > 0 && (
          <>
            <section class="card" aria-labelledby="w-trend">
              <h2 class="card__title" id="w-trend">
                Tendance
              </h2>
              <dl class="kv">
                <div>
                  <dt>Par semaine</dt>
                  <dd>{trend == null ? 'En attente' : `${fmtSigned(trend)} kg`}</dd>
                </div>
                {lastMa && (
                  <div>
                    <dt>Moyenne 7 jours</dt>
                    <dd>{fmtKg(lastMa.kg)} kg</dd>
                  </div>
                )}
                {list.length > 1 && (
                  <div>
                    <dt>Depuis le début</dt>
                    <dd>{fmtSigned(last!.kg - list[0]!.kg)} kg</dd>
                  </div>
                )}
              </dl>
              {trend == null && (
                <p class="muted small">La tendance demande au moins 3 pesées réparties sur une semaine.</p>
              )}
            </section>

            <section class="card" aria-labelledby="w-chart">
              <div class="card__head">
                <h2 class="card__title" id="w-chart">
                  Courbe
                </h2>
              </div>
              <Segmented
                legend="Période"
                hideLegend
                value={range}
                onChange={setRange}
                options={[
                  { value: 30, label: '1 mois' },
                  { value: 90, label: '3 mois' },
                  { value: 365, label: '1 an' },
                  { value: 0, label: 'Tout' },
                ]}
              />
              <WeightChart points={chartPoints.points} ma={chartPoints.ma} />
              <p class="legend">
                <span class="legend__dot" aria-hidden="true" /> Pesées
                <span class="legend__line" aria-hidden="true" /> Moyenne 7 jours
              </p>
            </section>

            <section class="card" aria-labelledby="w-hist">
              <h2 class="card__title" id="w-hist">
                Historique
              </h2>
              <ul class="list list--cv">
                {[...list].reverse().map((w, i, arr) => {
                  const prev = arr[i + 1];
                  return (
                    <li key={w.date}>
                      <button type="button" class="row" onClick={() => setEditing(w)}>
                        <span class="row__main">
                          <span class="row__title">{relativeDayLabel(w.date, today)}</span>
                        </span>
                        {prev && <span class="row__sub delta">{fmtSigned(w.kg - prev.kg)}</span>}
                        <span class="row__kcal">{fmtKg(w.kg)} kg</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </main>
      {editing && <EditWeight entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function UpdatePrompt({ profile, kg, onDone }: { profile: Profile; kg: number; onDone: () => void }) {
  const today = useStore((s) => s.today);
  const now = computeTargets(profile, today);
  const next = computeTargets({ ...profile, weightKg: kg }, today);
  return (
    <section class="card prompt" role="region" aria-labelledby="w-prompt">
      <h2 class="card__title" id="w-prompt">
        Mettre à jour mes objectifs ?
      </h2>
      {profile.override ? (
        <p class="muted">Tes objectifs sont réglés à la main. Seul le poids du profil passera à {fmtKg(kg)} kg.</p>
      ) : (
        <p class="muted">
          Avec {fmtKg(kg)} kg : {fmtInt(next.kcal)} kcal et {fmtInt(next.protein)} g de protéines par jour
          (actuellement {fmtInt(now.kcal)} kcal et {fmtInt(now.protein)} g).
        </p>
      )}
      <div class="row-actions">
        <button
          type="button"
          class="btn btn--primary"
          onClick={() => {
            saveProfile({ ...profile, weightKg: kg });
            showToast('Objectifs mis à jour.');
            onDone();
          }}
        >
          Mettre à jour
        </button>
        <button type="button" class="btn btn--ghost" onClick={onDone}>
          Plus tard
        </button>
      </div>
    </section>
  );
}

function EditWeight({ entry, onClose }: { entry: WeightEntry; onClose: () => void }) {
  const [text, setText] = useState(toInputString(entry.kg));
  const kg = parseDecimal(text);
  return (
    <Sheet title={`Pesée : ${longDayLabel(entry.date)}`} onClose={onClose}>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid(kg)) return;
          saveWeight(entry.date, Math.round(kg * 10) / 10);
          onClose();
        }}
      >
        <Field
          label="Poids"
          value={text}
          onValue={setText}
          suffix="kg"
          decimal
          error={!valid(kg) ? 'Poids entre 30 et 300 kg.' : null}
        />
        <button type="submit" class="btn btn--primary btn--block" disabled={!valid(kg)}>
          Enregistrer
        </button>
        <button
          type="button"
          class="btn btn--danger-ghost btn--block"
          onClick={() => {
            removeWeight(entry);
            onClose();
          }}
        >
          <Icon name="trash" size={20} />
          Supprimer cette pesée
        </button>
      </form>
    </Sheet>
  );
}

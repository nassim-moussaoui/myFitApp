import { useEffect, useMemo, useState } from 'preact/hooks';
import { ensureWeights, milestoneToast, removeWeight, saveProfile, saveWeight } from '../../app/actions';
import { lazy } from '../../app/lazy';
import { showToast, useStore } from '../../app/store';
import type { WeightEntry } from '../../lib/db/schema';
import { addDays, isValidISODate, longDayLabel, relativeDayLabel } from '../../lib/date';
import { fmtInt, fmtKg, fmtSigned, parseDecimal, toInputString } from '../../lib/format';
import { plannedWeeklyRate, type AdvanceResult } from '../../lib/nutrition/goals';
import { computeTargets } from '../../lib/nutrition/targets';
import type { Profile } from '../../lib/nutrition/types';
import { movingAverage, weeklyTrend } from '../../lib/nutrition/weight';
import { Field, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { MeasurementsView, PhotosView } from './Body';
import { CelebrationSheet, GoalSheet, MilestoneCard, MilestoneHistory, ProjectionCard } from './Goals';

const WeightChart = lazy(
  () => import('./WeightChart'),
  () => <div class="chart chart--placeholder skeleton" aria-hidden="true" />,
);

type Range = 30 | 90 | 365 | 0;

const valid = (kg: number | null): kg is number => kg != null && kg >= 30 && kg <= 300;

export default function WeightScreen({ profile }: { profile: Profile }) {
  const weights = useStore((s) => s.weights);
  const goals = useStore((s) => s.goals);
  const today = useStore((s) => s.today);
  const [goalSheet, setGoalSheet] = useState(false);
  const [celebration, setCelebration] = useState<AdvanceResult | null>(null);
  const [kgText, setKgText] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [prompt, setPrompt] = useState<number | null>(null);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [range, setRange] = useState<Range>(90);
  const [view, setView] = useState<'poids' | 'mesures' | 'photos'>('poids');

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
  const rate = plannedWeeklyRate(profile, today);
  const latest = last ? { date: last.date, kg: last.kg } : { date: today, kg: profile.weightKg };

  const step = (d: number) => {
    const base = valid(kg) ? kg : (last?.kg ?? profile.weightKg);
    setKgText(toInputString(Math.round((base + d) * 10) / 10));
  };

  const chartPoints = useMemo(() => {
    if (!range || !last) return { points: list, ma };
    const from = addDays(last.date, -(range - 1));
    return {
      points: list.filter((p) => p.date >= from),
      ma: ma.filter((p) => p.date >= from),
    };
  }, [list, ma, range, last]);

  const save = (e: Event) => {
    e.preventDefault();
    if (!valid(kg) || !isValidISODate(date) || date > today) return;
    const value = Math.round(kg * 10) / 10;
    const r = saveWeight(date, value);
    setKgText(null);
    showToast(milestoneToast(r) ?? `Pesée enregistrée : ${fmtKg(value)} kg`);
    if (r && (r.reached || r.finalJustReached)) setCelebration(r);
    const isLatest = !last || date >= last.date;
    if (isLatest && Math.abs(value - profile.weightKg) >= 0.1) setPrompt(value);
  };

  const trendGood =
    trend != null &&
    (profile.goal === 'lose' ? trend <= 0 : profile.goal === 'gain' ? trend >= 0 : Math.abs(trend) < 0.2);

  return (
    <>
      <header class="page-header">
        <h1 class="page-title">Poids</h1>
      </header>
      <main class="page" id="main">
        <Segmented
          legend="Section"
          hideLegend
          value={view}
          onChange={setView}
          options={[
            { value: 'poids', label: 'Poids' },
            { value: 'mesures', label: 'Mesures' },
            { value: 'photos', label: 'Photos' },
          ]}
        />
        {view === 'mesures' && <MeasurementsView />}
        {view === 'photos' && <PhotosView />}
        {view === 'poids' && (
          <>
            {goals && (
              <MilestoneCard
                goals={goals}
                latest={latest}
                today={today}
                rate={rate}
                onEdit={() => setGoalSheet(true)}
              />
            )}

            <form class="card" onSubmit={save} aria-labelledby="w-new">
              <h2 class="card__title" id="w-new">
                Nouvelle pesée
              </h2>
              <div class="stepper">
                <button
                  type="button"
                  class="icon-btn icon-btn--filled stepper__btn"
                  onClick={() => step(-0.1)}
                  aria-label="Moins 0,1 kg"
                >
                  <Icon name="minus" stroke={2.4} />
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
                <button
                  type="button"
                  class="icon-btn icon-btn--filled stepper__btn"
                  onClick={() => step(0.1)}
                  aria-label="Plus 0,1 kg"
                >
                  <Icon name="plus" stroke={2.4} />
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

            {goals && weights && (
              <ProjectionCard
                profile={profile}
                goals={goals}
                latest={latest}
                history={list}
                ma={ma}
                trend={trend}
                rate={rate}
                today={today}
              />
            )}

            {weights && list.length === 0 && (
              <div class="card empty">
                <span class="empty__icon" aria-hidden="true">
                  <Icon name="weight" size={22} />
                </span>
                <p class="empty__title">Aucune pesée pour l'instant</p>
                <p class="empty__text">
                  Pèse-toi le matin, dans les mêmes conditions. La courbe et la tendance apparaîtront ici.
                </p>
              </div>
            )}

            {list.length > 0 && (
              <>
                <section class="card" aria-labelledby="w-trend">
                  <div class="card__head">
                    <h2 class="card__title" id="w-trend">
                      Tendance
                    </h2>
                    {trend != null && (
                      <span class={`pill ${trendGood ? 'pill--accent' : ''}`}>
                        <Icon name={trend <= 0 ? 'trendDown' : 'trendUp'} size={16} stroke={2.2} />
                        {fmtSigned(trend)} kg / sem.
                      </span>
                    )}
                  </div>
                  <div class="tiles">
                    <div class="tile">
                      <span class="tile__label">Actuel</span>
                      <span class="tile__value">
                        {fmtKg(last!.kg)} <small>kg</small>
                      </span>
                    </div>
                    <div class="tile">
                      <span class="tile__label">Moy. 7 jours</span>
                      <span class="tile__value">
                        {lastMa ? fmtKg(lastMa.kg) : fmtKg(last!.kg)} <small>kg</small>
                      </span>
                    </div>
                    <div class="tile">
                      <span class="tile__label">Depuis le début</span>
                      <span class="tile__value">
                        {fmtSigned(last!.kg - list[0]!.kg)} <small>kg</small>
                      </span>
                    </div>
                  </div>
                  {trend == null && (
                    <p class="footnote">La tendance s'affiche après 3 pesées réparties sur au moins une semaine.</p>
                  )}
                </section>

                <section class="card" aria-labelledby="w-chart">
                  <h2 class="card__title" id="w-chart">
                    Évolution
                  </h2>
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
                    <span class="legend__item">
                      <span class="legend__dot" aria-hidden="true" /> Pesées
                    </span>
                    <span class="legend__item">
                      <span class="legend__line" aria-hidden="true" /> Moyenne 7 jours
                    </span>
                  </p>
                </section>

                {goals && <MilestoneHistory goals={goals} />}

                <section class="card" aria-labelledby="w-hist" style={{ paddingBottom: '0.25rem', gap: '0.5rem' }}>
                  <div class="card__head">
                    <h2 class="card__title" id="w-hist">
                      Historique
                    </h2>
                    <span class="card__sub">
                      {list.length} pesée{list.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <ul class="list list--cv">
                    {[...list].reverse().map((w, i, arr) => {
                      const prev = arr[i + 1];
                      return (
                        <li key={w.date}>
                          <button type="button" class="row" onClick={() => setEditing(w)}>
                            <span class="row__main">
                              <span class="row__title">{relativeDayLabel(w.date, today)}</span>
                              {prev && <span class="row__sub">{fmtSigned(w.kg - prev.kg)} kg</span>}
                            </span>
                            <span class="row__value">{fmtKg(w.kg)} kg</span>
                            <span class="row__chev" aria-hidden="true">
                              <Icon name="chevron" size={18} />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </>
            )}
          </>
        )}
      </main>
      {editing && <EditWeight entry={editing} onClose={() => setEditing(null)} />}
      {goalSheet && goals && (
        <GoalSheet goals={goals} latest={latest} rate={rate} onClose={() => setGoalSheet(false)} />
      )}
      {celebration && <CelebrationSheet result={celebration} profile={profile} onClose={() => setCelebration(null)} />}
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
        <div class="tiles" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div class="tile">
            <span class="tile__label">Calories</span>
            <span class="tile__value">{fmtInt(next.kcal)}</span>
            <span class="tile__hint">au lieu de {fmtInt(now.kcal)} kcal</span>
          </div>
          <div class="tile">
            <span class="tile__label">Protéines</span>
            <span class="tile__value">
              {fmtInt(next.protein)} <small>g</small>
            </span>
            <span class="tile__hint">au lieu de {fmtInt(now.protein)} g</span>
          </div>
        </div>
      )}
      <div class="btn-row">
        <button type="button" class="btn btn--secondary btn--sm" onClick={onDone}>
          Plus tard
        </button>
        <button
          type="button"
          class="btn btn--primary btn--sm"
          onClick={() => {
            saveProfile({ ...profile, weightKg: kg });
            showToast('Objectifs mis à jour');
            onDone();
          }}
        >
          Mettre à jour
        </button>
      </div>
    </section>
  );
}

function EditWeight({ entry, onClose }: { entry: WeightEntry; onClose: () => void }) {
  const [text, setText] = useState(toInputString(entry.kg));
  const kg = parseDecimal(text);
  return (
    <Sheet title="Modifier la pesée" subtitle={longDayLabel(entry.date)} onClose={onClose}>
      <form
        class="sheet__content"
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
        <div class="stack stack--tight">
          <button type="submit" class="btn btn--primary btn--block" disabled={!valid(kg)}>
            Enregistrer
          </button>
          <button
            type="button"
            class="btn btn--danger-soft btn--block"
            onClick={() => {
              removeWeight(entry);
              onClose();
            }}
          >
            <Icon name="trash" size={20} />
            Supprimer cette pesée
          </button>
        </div>
      </form>
    </Sheet>
  );
}

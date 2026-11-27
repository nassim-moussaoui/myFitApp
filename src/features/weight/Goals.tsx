import { useMemo, useState } from 'preact/hooks';
import { saveGoals, saveProfile, syncGoals } from '../../app/actions';
import { lazy } from '../../app/lazy';
import { showToast } from '../../app/store';
import { addDays, diffDays, isValidISODate, longDayLabel, shortDayLabel, type ISODate } from '../../lib/date';
import { fmtInt, fmtKg, fmtSigned, parseDecimal, toInputString } from '../../lib/format';
import {
  MILESTONE_DURATIONS,
  etaDate,
  historySummary,
  makeMilestone,
  milestoneDirection,
  milestoneProgress,
  projectKg,
  type AdvanceResult,
  type Milestone,
  type WeightGoals,
} from '../../lib/nutrition/goals';
import { effectiveTargets } from '../../lib/nutrition/targets';
import type { Profile } from '../../lib/nutrition/types';
import type { WeightPoint } from '../../lib/nutrition/weight';
import { Field, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';

const ProjectionChart = lazy(
  () => import('./ProjectionChart'),
  () => <div class="chart chart--placeholder skeleton" aria-hidden="true" />,
);

const durationLabel = (d: number) => (d === 14 ? '2 semaines' : `${d} jours`);
const daysWord = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;

// ---------------------------------------------------------------- Current milestone

export function MilestoneCard({
  goals,
  latest,
  today,
  rate,
  onEdit,
}: {
  goals: WeightGoals;
  latest: WeightPoint;
  today: ISODate;
  rate: number;
  onEdit: () => void;
}) {
  const m = goals.current;
  const lastWin = goals.history[goals.history.length - 1];
  const recentWin = lastWin && diffDays(lastWin.reachedDate, today) <= 7 ? lastWin : null;

  if (goals.finalReachedDate && goals.finalKg != null) {
    return (
      <section class="card milestone milestone--done" aria-labelledby="ms-title">
        <div class="milestone__win">
          <span class="milestone__badge" aria-hidden="true">
            <Icon name="check" size={22} stroke={3} />
          </span>
          <div>
            <h2 class="card__title" id="ms-title">
              Objectif atteint
            </h2>
            <p class="footnote">
              {fmtKg(goals.finalKg)} kg atteints le {longDayLabel(goals.finalReachedDate).toLowerCase()}.
            </p>
          </div>
        </div>
        <button type="button" class="btn btn--secondary btn--block" onClick={onEdit}>
          Fixer un nouvel objectif
        </button>
      </section>
    );
  }

  if (rate === 0) {
    return (
      <section class="card milestone" aria-labelledby="ms-title">
        <h2 class="card__title" id="ms-title">
          Paliers
        </h2>
        <p class="muted">
          Tu es en maintien : les paliers s'activent quand ton objectif est de perdre ou de prendre du poids.
        </p>
        <a class="btn btn--secondary btn--block" href="#/reglages">
          Changer d'objectif
        </a>
      </section>
    );
  }

  if (!m) {
    return (
      <section class="card milestone" aria-labelledby="ms-title">
        <div class="card__head">
          <h2 class="card__title" id="ms-title">
            Paliers
          </h2>
        </div>
        <p class="muted">Aucun palier en cours.</p>
        <button type="button" class="btn btn--secondary btn--block" onClick={onEdit}>
          Régler mes paliers
        </button>
      </section>
    );
  }

  const total = Math.max(1, diffDays(m.startDate, m.dueDate));
  const elapsed = Math.min(total, Math.max(0, diffDays(m.startDate, today)));
  const left = diffDays(today, m.dueDate);
  const progress = milestoneProgress(m, latest.kg);
  const remaining = Math.abs(latest.kg - m.targetKg);
  const expected = m.startKg + (m.targetKg - m.startKg) * (elapsed / total);
  const ahead = milestoneDirection(m) < 0 ? latest.kg <= expected + 0.05 : latest.kg >= expected - 0.05;
  const overdue = left < 0;

  return (
    <section class="card milestone" aria-labelledby="ms-title">
      <div class="card__head">
        <h2 class="card__title" id="ms-title">
          Palier en cours
        </h2>
        <button type="button" class="btn btn--plain btn--sm" onClick={onEdit}>
          Régler
        </button>
      </div>

      {recentWin && (
        <p class="milestone__recent">
          <Icon name="check" size={16} stroke={3} />
          Palier précédent atteint : {fmtSigned(recentWin.reachedKg - recentWin.startKg)} kg en{' '}
          {daysWord(Math.max(1, diffDays(recentWin.startDate, recentWin.reachedDate)))}
        </p>
      )}

      <div class="milestone__main">
        <p class="hero-num">
          <span class="hero-num__value">{fmtKg(m.targetKg)}</span> <span class="hero-num__unit">kg</span>
        </p>
        <div class="milestone__meta">
          <span class={`pill ${overdue ? '' : ahead ? 'pill--accent' : ''}`}>
            {overdue ? 'Échéance passée' : ahead ? 'En avance' : 'Garde le cap'}
          </span>
          <span class="footnote">
            {overdue
              ? `depuis le ${shortDayLabel(m.dueDate)}`
              : left === 0
                ? "Dernier jour aujourd'hui"
                : `${daysWord(left)} restant${left > 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      <div class="milestone__track">
        <div
          class="bar progress-line"
          role="progressbar"
          aria-label="Progression du palier"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div class="bar__fill bg-accent" style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div class="milestone__ends">
          <span>Départ {fmtKg(m.startKg)} kg</span>
          <span>
            <strong>Encore {fmtKg(remaining)} kg</strong>
          </span>
        </div>
      </div>

      {overdue && (
        <div class="stack stack--tight">
          <p class="footnote">Pas encore atteint, ce n'est pas grave : prolonge ou repars de ton poids actuel.</p>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn--secondary btn--sm"
              onClick={() => saveGoals({ ...goals, current: { ...m, dueDate: addDays(today, goals.durationDays) } })}
            >
              Prolonger
            </button>
            <button
              type="button"
              class="btn btn--plain btn--sm"
              onClick={() =>
                saveGoals({
                  ...goals,
                  current: makeMilestone(latest.date, latest.kg, rate, goals.durationDays, goals.finalKg),
                })
              }
            >
              Repartir de {fmtKg(latest.kg)} kg
            </button>
          </div>
        </div>
      )}

      {goals.finalKg != null && (
        <div class="kv-row milestone__final">
          <span>Objectif final</span>
          <span class="muted num">
            {fmtKg(goals.finalKg)} kg · encore {fmtKg(Math.abs(latest.kg - goals.finalKg))} kg
          </span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- History

export function MilestoneHistory({ goals }: { goals: WeightGoals }) {
  if (!goals.history.length) return null;
  const sum = historySummary(goals.history);
  const items = [...goals.history].reverse().slice(0, 8);
  return (
    <section class="card" aria-labelledby="ms-hist" style={{ gap: '0.5rem', paddingBottom: '0.25rem' }}>
      <div class="card__head">
        <h2 class="card__title" id="ms-hist">
          Paliers atteints
        </h2>
        <span class="pill pill--accent">
          {sum.achieved} · {fmtSigned(sum.totalKg)} kg
        </span>
      </div>
      <ul class="list">
        {items.map((h) => (
          <li class="row" key={`${h.startDate}-${h.reachedDate}`}>
            <span class="milestone__dot" aria-hidden="true">
              <Icon name="check" size={14} stroke={3} />
            </span>
            <span class="row__main">
              <span class="row__title">Palier {fmtKg(h.targetKg)} kg</span>
              <span class="row__sub">
                {fmtKg(h.startKg)} → {fmtKg(h.reachedKg)} kg en{' '}
                {daysWord(Math.max(1, diffDays(h.startDate, h.reachedDate)))}
              </span>
            </span>
            <span class="row__sub">{shortDayLabel(h.reachedDate)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Settings sheet

export function GoalSheet({
  goals,
  latest,
  rate,
  onClose,
}: {
  goals: WeightGoals;
  latest: WeightPoint;
  rate: number;
  onClose: () => void;
}) {
  const m = goals.current;
  const [finalText, setFinalText] = useState(goals.finalReachedDate ? '' : toInputString(goals.finalKg));
  const [duration, setDuration] = useState(goals.durationDays);
  const base = m ?? { startDate: latest.date, startKg: latest.kg };
  const suggested = makeMilestone(base.startDate, base.startKg, rate, duration, parseDecimal(finalText));
  const [targetText, setTargetText] = useState(toInputString(m?.targetKg ?? suggested?.targetKg));
  const [targetEdited, setTargetEdited] = useState(false);
  const shownTarget = targetEdited ? targetText : toInputString(suggested?.targetKg);

  const finalKg = finalText.trim() === '' ? null : parseDecimal(finalText);
  const dir = Math.sign(rate);
  let finalErr: string | null = null;
  if (finalText.trim() !== '') {
    if (finalKg == null || finalKg < 30 || finalKg > 300) finalErr = 'Entre 30 et 300 kg.';
    else if (dir < 0 && finalKg >= latest.kg) finalErr = `Pour perdre, vise moins de ${fmtKg(latest.kg)} kg.`;
    else if (dir > 0 && finalKg <= latest.kg) finalErr = `Pour prendre, vise plus de ${fmtKg(latest.kg)} kg.`;
  }
  const target = parseDecimal(shownTarget);
  let targetErr: string | null = null;
  if (dir !== 0 && shownTarget !== '') {
    if (target == null) targetErr = 'Valeur invalide.';
    else if (dir < 0 && (target >= base.startKg || target < base.startKg - 10))
      targetErr = `Entre ${fmtKg(base.startKg - 10)} et ${fmtKg(base.startKg - 0.1)} kg.`;
    else if (dir > 0 && (target <= base.startKg || target > base.startKg + 10))
      targetErr = `Entre ${fmtKg(base.startKg + 0.1)} et ${fmtKg(base.startKg + 10)} kg.`;
    else if (finalKg != null && !finalErr && (dir < 0 ? target < finalKg : target > finalKg))
      targetErr = 'Le palier ne peut pas dépasser ton objectif final.';
  }
  const ok = !finalErr && !targetErr;

  const save = () => {
    if (!ok) return;
    const finalChanged = finalKg !== goals.finalKg;
    let current: Milestone | null = makeMilestone(base.startDate, base.startKg, rate, duration, finalKg);
    if (targetEdited && target != null && dir !== 0) {
      current = {
        startDate: base.startDate,
        startKg: Math.round(base.startKg * 10) / 10,
        targetKg: Math.round(target * 10) / 10,
        dueDate: addDays(base.startDate, duration),
      };
    } else if (!finalChanged && duration === goals.durationDays && m) {
      current = m;
    }
    saveGoals({
      ...goals,
      finalKg,
      durationDays: duration,
      current,
      finalReachedDate: finalChanged ? null : goals.finalReachedDate,
    });
    syncGoals();
    showToast('Paliers mis à jour');
    onClose();
  };

  return (
    <Sheet title="Mes paliers" subtitle="De petits objectifs, un à la fois" onClose={onClose}>
      <form
        class="sheet__content"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field
          label="Poids visé (facultatif)"
          value={finalText}
          onValue={setFinalText}
          suffix="kg"
          decimal
          hint="Les paliers s'arrêtent à ce poids. Laisse vide pour avancer palier par palier."
          error={finalErr}
        />
        <Segmented
          legend="Durée d'un palier"
          value={duration}
          onChange={(d) => {
            setDuration(d);
            setTargetEdited(false);
          }}
          options={MILESTONE_DURATIONS.map((d) => ({ value: d, label: durationLabel(d) }))}
        />
        {dir !== 0 && (
          <Field
            label="Cible du palier en cours"
            value={shownTarget}
            onValue={(v) => {
              setTargetText(v);
              setTargetEdited(true);
            }}
            suffix="kg"
            decimal
            hint={
              suggested
                ? `À ton rythme (${fmtSigned(rate)} kg/sem.) : ${fmtKg(suggested.targetKg)} kg en ${durationLabel(duration)}.`
                : undefined
            }
            error={targetErr}
          />
        )}
        <div class="stack stack--tight">
          <button type="submit" class="btn btn--primary btn--block" disabled={!ok}>
            Enregistrer
          </button>
          {dir !== 0 && (
            <button
              type="button"
              class="btn btn--plain btn--block"
              onClick={() => {
                saveGoals({
                  ...goals,
                  finalKg: finalErr ? goals.finalKg : finalKg,
                  durationDays: duration,
                  current: makeMilestone(latest.date, latest.kg, rate, duration, finalErr ? goals.finalKg : finalKg),
                });
                showToast(`Nouveau palier depuis ${fmtKg(latest.kg)} kg`);
                onClose();
              }}
            >
              Repartir de mon poids actuel ({fmtKg(latest.kg)} kg)
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Celebration

export function CelebrationSheet({
  result,
  profile,
  onClose,
}: {
  result: AdvanceResult;
  profile: Profile;
  onClose: () => void;
}) {
  const r = result.reached;
  const next = result.goals.current;
  const final = result.finalJustReached;
  return (
    <Sheet title={final ? 'Objectif atteint !' : 'Palier atteint !'} onClose={onClose} class="celebrate-sheet">
      <div class="sheet__content">
        <div class="celebrate">
          <span class="celebrate__burst" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} style={{ '--a': `${i * 36}deg` } as Record<string, string>} />
            ))}
          </span>
          <span class="celebrate__badge" aria-hidden="true">
            <Icon name="check" size={40} stroke={3} />
          </span>
          {r && (
            <>
              <p class="celebrate__big">
                {fmtSigned(r.reachedKg - r.startKg)} kg en {daysWord(Math.max(1, diffDays(r.startDate, r.reachedDate)))}
              </p>
              <p class="muted">
                De {fmtKg(r.startKg)} à {fmtKg(r.reachedKg)} kg. Bien joué, continue comme ça.
              </p>
            </>
          )}
          {final && (
            <p class="muted">
              Tu as atteint ton poids visé
              {result.goals.finalKg != null ? ` de ${fmtKg(result.goals.finalKg)} kg` : ''}. Passe en maintien pour
              le stabiliser.
            </p>
          )}
        </div>
        {!final && next && (
          <p class="notice notice--accent">
            <span>
              Prochain palier : <strong>{fmtKg(next.targetKg)} kg</strong> d'ici le{' '}
              {longDayLabel(next.dueDate).toLowerCase()}.
            </span>
          </p>
        )}
        <div class="stack stack--tight">
          {final && profile.goal !== 'maintain' && (
            <button
              type="button"
              class="btn btn--primary btn--block"
              onClick={() => {
                saveProfile({ ...profile, goal: 'maintain', rateKgPerWeek: 0 });
                showToast('Objectif passé en maintien');
                onClose();
              }}
            >
              Passer en maintien
            </button>
          )}
          <button type="button" class={`btn btn--block ${final ? 'btn--plain' : 'btn--primary'}`} onClick={onClose}>
            {final ? 'Plus tard' : 'Continuer'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Projection

type Horizon = 30 | 90 | 180;

export function ProjectionCard({
  profile,
  goals,
  latest,
  history,
  ma,
  trend,
  rate,
  today,
}: {
  profile: Profile;
  goals: WeightGoals;
  latest: WeightPoint;
  history: WeightPoint[];
  ma: WeightPoint[];
  trend: number | null;
  rate: number;
  today: ISODate;
}) {
  const [horizon, setHorizon] = useState<Horizon>(90);
  const [atText, setAtText] = useState('');
  const finalKg = goals.finalReachedDate ? null : goals.finalKg;
  const end = addDays(today, horizon);
  const start = addDays(today, -(horizon <= 30 ? 21 : 45));
  const win = useMemo(
    () => ({ history: history.filter((h) => h.date >= start), ma: ma.filter((h) => h.date >= start) }),
    [history, ma, start],
  );
  const endKg = projectKg(latest, rate, end, finalKg);
  const eta = finalKg != null ? etaDate(latest, rate, finalKg) : null;
  const kcal = effectiveTargets(profile, today).kcal;
  const atValid = isValidISODate(atText) && atText > today;
  const atKg = atValid ? projectKg(latest, rate, atText, finalKg) : null;
  const realKg = trend != null && Math.abs(trend - rate) >= 0.1 ? latest.kg + (trend * diffDays(latest.date, end)) / 7 : null;

  return (
    <section class="card" aria-labelledby="w-proj">
      <div class="card__head">
        <h2 class="card__title" id="w-proj">
          Projection
        </h2>
        <span class="pill">{rate === 0 ? 'Maintien' : `${fmtSigned(rate)} kg / sem. prévu`}</span>
      </div>
      <Segmented
        legend="Horizon"
        hideLegend
        value={horizon}
        onChange={setHorizon}
        options={[
          { value: 30, label: '1 mois' },
          { value: 90, label: '3 mois' },
          { value: 180, label: '6 mois' },
        ]}
      />
      <ProjectionChart
        history={win.history}
        ma={win.ma}
        anchor={latest}
        rate={rate}
        finalKg={finalKg}
        milestoneKg={goals.current?.targetKg ?? null}
        start={start < latest.date ? start : addDays(latest.date, -7)}
        end={end}
        today={today}
      />
      <p class="legend">
        <span class="legend__item">
          <span class="legend__line" aria-hidden="true" /> Moyenne 7 jours
        </span>
        <span class="legend__item">
          <span class="legend__proj" aria-hidden="true" /> Projection
        </span>
        {goals.current && (
          <span class="legend__item">
            <span class="legend__milestone" aria-hidden="true" /> Palier
          </span>
        )}
        {finalKg != null && (
          <span class="legend__item">
            <span class="legend__target" aria-hidden="true" /> Objectif
          </span>
        )}
      </p>

      <div class="projection__result">
        <span class="tile__label">Le {longDayLabel(end).toLowerCase()}</span>
        <p class="hero-num">
          <span class="hero-num__value">≈ {fmtKg(endKg)}</span> <span class="hero-num__unit">kg</span>
          <span class="pill">{fmtSigned(endKg - latest.kg)} kg</span>
        </p>
      </div>

      {finalKg != null && (
        <p class="footnote">
          {eta
            ? `Objectif de ${fmtKg(finalKg)} kg atteint vers le ${longDayLabel(eta).toLowerCase()}, dans environ ${Math.max(
                1,
                Math.round(diffDays(today, eta) / 7),
              )} semaines.`
            : `À ce rythme, ton objectif de ${fmtKg(finalKg)} kg n'est pas dans la bonne direction.`}
        </p>
      )}
      {realKg != null && (
        <p class="footnote">
          À ton rythme réel ({fmtSigned(trend!)} kg/sem.), tu serais plutôt à {fmtKg(realKg)} kg à cette date.
        </p>
      )}

      <hr class="divider" />
      <Field
        label="Estimer pour une date"
        type="date"
        value={atText}
        onValue={setAtText}
        min={addDays(today, 1)}
        hint={atKg != null ? undefined : 'Choisis une date à venir.'}
      />
      {atKg != null && (
        <p class="projection__at" aria-live="polite">
          Le {longDayLabel(atText).toLowerCase()} : <strong>≈ {fmtKg(atKg)} kg</strong>
        </p>
      )}
      <p class="footnote">
        Estimation linéaire basée sur ta cible de {fmtInt(kcal)} kcal par jour. Ta dépense baisse un peu quand ton
        poids change : l'app te propose de recalculer tes objectifs après chaque pesée.
      </p>
    </section>
  );
}

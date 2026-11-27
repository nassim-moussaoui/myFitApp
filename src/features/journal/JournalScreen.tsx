import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { copyMeal, ensureDay, setDate } from '../../app/actions';
import { store, useStore } from '../../app/store';
import type { Entry } from '../../lib/db/schema';
import { addDays, longDayLabel, relativeDayLabel, type ISODate } from '../../lib/date';
import { fmtDec, fmtInt } from '../../lib/format';
import { scaleNutrients, totalOf } from '../../lib/nutrition/food';
import { effectiveTargets } from '../../lib/nutrition/targets';
import { MEALS, type MealId, type Profile } from '../../lib/nutrition/types';
import { Icon } from '../../ui/Icon';
import { MacroBar, Ring } from '../../ui/Progress';
import { useSwipe } from './useSwipe';

const EMPTY: Entry[] = [];

export function JournalScreen({ profile }: { profile: Profile }) {
  const date = useStore((s) => s.date);
  const today = useStore((s) => s.today);
  const entries = useStore((s) => s.days[date]);
  const yesterday = useStore((s) => s.days[addDays(date, -1)]);
  const [anim, setAnim] = useState<'' | 'left' | 'right'>('');
  const swipeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ensureDay(date);
    void ensureDay(addDays(date, -1));
  }, [date]);

  const go = useCallback((delta: number) => {
    setAnim(delta > 0 ? 'left' : 'right');
    setDate(addDays(store.get().date, delta));
  }, []);
  useSwipe(swipeRef, useCallback((dir) => go(dir === 'left' ? 1 : -1), [go]));

  const list = entries ?? EMPTY;
  const targets = effectiveTargets(profile, today);
  const total = useMemo(() => totalOf(list), [list]);
  const label = relativeDayLabel(date, today);

  return (
    <>
      <header class="topbar">
        <div class="daynav">
          <button type="button" class="icon-btn" onClick={() => go(-1)} aria-label="Jour précédent">
            <Icon name="left" />
          </button>
          <div class="daynav__center">
            <h1 class="daynav__title">{label}</h1>
            <span class="daynav__sub">{longDayLabel(date)}</span>
            <input
              class="daynav__picker"
              type="date"
              value={date}
              aria-label="Choisir une date"
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v) setDate(v);
              }}
            />
          </div>
          <button type="button" class="icon-btn" onClick={() => go(1)} aria-label="Jour suivant">
            <Icon name="right" />
          </button>
        </div>
        {date !== today && (
          <button type="button" class="chip chip--today" onClick={() => setDate(today)}>
            Revenir à aujourd'hui
          </button>
        )}
      </header>

      <main class="screen" id="main">
        <div ref={swipeRef} class="swipe-area">
          <div key={date} class={`day ${anim ? `day--from-${anim}` : ''}`}>
            <section class="card summary" aria-label="Bilan du jour">
              <div class="summary__top">
                <Ring value={total.kcal} target={targets.kcal} />
                <dl class="summary__figures">
                  <div>
                    <dt>Consommé</dt>
                    <dd>{fmtInt(total.kcal)} kcal</dd>
                  </div>
                  <div>
                    <dt>Objectif</dt>
                    <dd>{fmtInt(targets.kcal)} kcal</dd>
                  </div>
                </dl>
              </div>
              <div class="summary__macros">
                <MacroBar label="Protéines" kind="protein" value={total.protein} target={targets.protein} />
                <MacroBar label="Glucides" kind="carbs" value={total.carbs} target={targets.carbs} />
                <MacroBar label="Lipides" kind="fat" value={total.fat} target={targets.fat} />
              </div>
              <p class="sr-only" aria-live="polite" aria-atomic="true">
                {label} : {fmtInt(total.kcal)} kcal sur {fmtInt(targets.kcal)}.{' '}
                {total.kcal <= targets.kcal
                  ? `Reste ${fmtInt(targets.kcal - total.kcal)} kcal.`
                  : `Dépassement de ${fmtInt(total.kcal - targets.kcal)} kcal.`}{' '}
                Protéines {fmtInt(total.protein)} g sur {fmtInt(targets.protein)}.
              </p>
            </section>

            {MEALS.map((m) => (
              <MealSection
                key={m.id}
                meal={m.id}
                label={m.label}
                date={date}
                entries={list.filter((e) => e.meal === m.id)}
                previous={(yesterday ?? EMPTY).filter((e) => e.meal === m.id)}
              />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}

function MealSection({
  meal,
  label,
  date,
  entries,
  previous,
}: {
  meal: MealId;
  label: string;
  date: ISODate;
  entries: Entry[];
  previous: Entry[];
}) {
  const id = `meal-${meal}`;
  const kcal = totalOf(entries).kcal;
  const prevKcal = totalOf(previous).kcal;
  return (
    <section class="card meal" aria-labelledby={id}>
      <header class="meal__head">
        <h2 id={id} class="meal__title">
          {label}
        </h2>
        {entries.length > 0 && <span class="meal__kcal">{fmtInt(kcal)} kcal</span>}
        <button
          type="button"
          class="icon-btn icon-btn--tint"
          aria-label={`Ajouter un aliment : ${label}`}
          onClick={() => store.set({ overlay: { kind: 'add', meal, date } })}
        >
          <Icon name="plus" />
        </button>
      </header>
      {entries.length > 0 ? (
        <ul class="list">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </ul>
      ) : (
        <p class="meal__empty">Rien pour l'instant.</p>
      )}
      {previous.length > 0 && (
        <button type="button" class="link-btn meal__copy" onClick={() => void copyMeal(addDays(date, -1), date, meal)}>
          <Icon name="copy" size={18} />
          Copier la veille ({previous.length} aliment{previous.length > 1 ? 's' : ''}, {fmtInt(prevKcal)} kcal)
        </button>
      )}
    </section>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const n = scaleNutrients(entry.per100, entry.grams);
  return (
    <li>
      <button type="button" class="row" onClick={() => store.set({ overlay: { kind: 'entry', entry } })}>
        <span class="row__main">
          <span class="row__title">{entry.name}</span>
          <span class="row__sub">
            {fmtDec(entry.grams)} g · P {fmtDec(n.protein)} · G {fmtDec(n.carbs)} · L {fmtDec(n.fat)}
          </span>
        </span>
        <span class="row__kcal">{fmtInt(n.kcal)} kcal</span>
      </button>
    </li>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { copyMeal, ensureDay, setDate } from '../../app/actions';
import { store, useStore } from '../../app/store';
import type { Entry } from '../../lib/db/schema';
import { addDays, longDayLabel, parseISODate, relativeDayLabel, type ISODate } from '../../lib/date';
import { fmtDec, fmtInt } from '../../lib/format';
import { scaleNutrients, totalOf } from '../../lib/nutrition/food';
import { effectiveTargets } from '../../lib/nutrition/targets';
import { MEALS, type MealId, type Profile } from '../../lib/nutrition/types';
import { Icon, type IconName } from '../../ui/Icon';
import { Macros, Ring } from '../../ui/Progress';
import { useSwipe } from './useSwipe';

const EMPTY: Entry[] = [];
const MEAL_ICON: Record<MealId, IconName> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
};
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const weekdayLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Monday of the week containing `date`. */
function weekStart(date: ISODate): ISODate {
  const dow = (parseISODate(date).getDay() + 6) % 7;
  return addDays(date, -dow);
}

export function JournalScreen({ profile }: { profile: Profile }) {
  const date = useStore((s) => s.date);
  const today = useStore((s) => s.today);
  const days = useStore((s) => s.days);
  const [anim, setAnim] = useState<'' | 'left' | 'right'>('');
  const swipeRef = useRef<HTMLDivElement>(null);
  const monday = weekStart(date);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  useEffect(() => {
    void ensureDay(date);
    void ensureDay(addDays(date, -1));
  }, [date]);
  useEffect(() => {
    week.forEach((d) => void ensureDay(d));
  }, [week]);

  const go = useCallback((delta: number) => {
    setAnim(delta > 0 ? 'left' : 'right');
    setDate(addDays(store.get().date, delta));
  }, []);
  const goTo = (d: ISODate) => {
    const cur = store.get().date;
    if (d === cur) return;
    setAnim(d > cur ? 'left' : 'right');
    setDate(d);
  };
  useSwipe(swipeRef, useCallback((dir) => go(dir === 'left' ? 1 : -1), [go]));

  const list = days[date] ?? EMPTY;
  const yesterday = days[addDays(date, -1)] ?? EMPTY;
  const targets = effectiveTargets(profile, today);
  const total = useMemo(() => totalOf(list), [list]);
  const label = relativeDayLabel(date, today);
  const isToday = date === today;

  return (
    <>
      <header class="page-header day-header">
        <div class="daynav">
          <button type="button" class="icon-btn icon-btn--filled" onClick={() => go(-1)} aria-label="Jour précédent">
            <Icon name="left" size={20} stroke={2.4} />
          </button>
          <div class="daynav__center">
            <div class="daynav__titlebox">
              <h1 class="daynav__title">{label}</h1>
              <span class="daynav__caret" aria-hidden="true">
                <Icon name="down" size={18} stroke={2.4} />
              </span>
              <input
                class="daynav__picker"
                type="date"
                value={date}
                aria-label="Choisir une date"
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  if (v) goTo(v);
                }}
              />
            </div>
            <div class="daynav__sub">
              {isToday ? (
                longDayLabel(date)
              ) : (
                <button type="button" class="daynav__today" onClick={() => goTo(today)}>
                  Revenir à aujourd'hui
                </button>
              )}
            </div>
          </div>
          <button type="button" class="icon-btn icon-btn--filled" onClick={() => go(1)} aria-label="Jour suivant">
            <Icon name="right" size={20} stroke={2.4} />
          </button>
        </div>
        <div class="week" role="group" aria-label="Semaine">
          {week.map((d, i) => {
            const logged = (days[d]?.length ?? 0) > 0;
            const cls = ['week__day', d === today && 'week__day--today', logged && 'week__day--logged']
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={d}
                type="button"
                class={cls}
                aria-pressed={d === date}
                onClick={() => goTo(d)}
              >
                <span class="sr-only">
                  {weekdayLong.format(parseISODate(d))}
                  {logged ? ', repas notés' : ''}
                </span>
                <span class="week__wd" aria-hidden="true">
                  {WEEKDAYS[i]}
                </span>
                <span class="week__num" aria-hidden="true">
                  {Number(d.slice(8))}
                </span>
                <span class="week__dot" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </header>

      <main class="page" id="main">
        <div ref={swipeRef} class="swipe-area">
          <div key={date} class={`day ${anim ? `day--from-${anim}` : ''}`}>
            <section class="card summary" aria-label="Bilan du jour">
              <div class="summary__top">
                <Ring value={total.kcal} target={targets.kcal} />
                <div class="summary__figures">
                  <p class="figure">
                    <span class="figure__icon" aria-hidden="true">
                      <Icon name="target" size={20} />
                    </span>
                    <span class="figure__text">
                      <span class="figure__label">Objectif</span>{' '}
                      <span class="figure__value">
                        {fmtInt(targets.kcal)} <small>kcal</small>
                      </span>
                    </span>
                  </p>
                  <p class="figure">
                    <span class="figure__icon figure__icon--accent" aria-hidden="true">
                      <Icon name="flame" size={20} />
                    </span>
                    <span class="figure__text">
                      <span class="figure__label">Consommé</span>{' '}
                      <span class="figure__value">
                        {fmtInt(total.kcal)} <small>kcal</small>
                      </span>
                    </span>
                  </p>
                </div>
              </div>
              <hr class="divider" />
              <Macros value={total} target={targets} />
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
                previous={yesterday.filter((e) => e.meal === m.id)}
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
  const t = totalOf(entries);
  const prevKcal = totalOf(previous).kcal;
  return (
    <section class="card meal" aria-labelledby={id}>
      <header class="meal__head">
        <span class="meal__icon" aria-hidden="true">
          <Icon name={MEAL_ICON[meal]} size={22} />
        </span>
        <div class="meal__titles">
          <h2 id={id} class="meal__title">
            {label}
          </h2>
          <p class="meal__meta">
            {entries.length
              ? `P ${fmtInt(t.protein)} g · G ${fmtInt(t.carbs)} g · L ${fmtInt(t.fat)} g`
              : "Rien pour l'instant"}
          </p>
        </div>
        {entries.length > 0 && (
          <span class="meal__kcal">
            {fmtInt(t.kcal)} <small>kcal</small>
          </span>
        )}
      </header>
      {entries.length > 0 && (
        <ul class="list">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
      <div class="meal__actions">
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          aria-label={`Ajouter un aliment : ${label}`}
          onClick={() => store.set({ overlay: { kind: 'add', meal, date } })}
        >
          <Icon name="plus" size={18} stroke={2.4} />
          Ajouter
        </button>
        {previous.length > 0 && (
          <button
            type="button"
            class="btn btn--plain btn--sm"
            onClick={() => void copyMeal(addDays(date, -1), date, meal)}
          >
            <Icon name="copy" size={18} />
            Copier la veille · {fmtInt(prevKcal)} kcal
          </button>
        )}
      </div>
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
            {fmtDec(entry.grams)} g{entry.brand ? ` · ${entry.brand}` : ''}
          </span>
        </span>
        <span class="row__value">
          {fmtInt(n.kcal)} <small>kcal</small>
        </span>
      </button>
    </li>
  );
}

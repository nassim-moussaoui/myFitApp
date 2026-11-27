import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { copyMeal, ensureDay, setDate } from '../../app/actions';
import { addWater, ensureWater } from '../../app/water';
import { lazy } from '../../app/lazy';
import { store, useStore } from '../../app/store';
import type { Entry } from '../../lib/db/schema';
import { addDays, longDayLabel, parseISODate, relativeDayLabel, type ISODate } from '../../lib/date';
import { fmtDec, fmtInt } from '../../lib/format';
import { MICRO_REF, microTotals, scaleNutrients, totalOf, type Micro } from '../../lib/nutrition/food';
import { currentStreak } from '../../lib/nutrition/stats';
import { effectiveTargets } from '../../lib/nutrition/targets';
import { MEALS, type MealId, type Profile } from '../../lib/nutrition/types';
import { Icon, type IconName } from '../../ui/Icon';
import { Macros, Ring } from '../../ui/Progress';
import { useSwipe } from './useSwipe';

const WeeklyReview = lazy(() => import('../stats/WeeklyReview'));

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
  const logged = useStore((s) => s.logged);
  const prefs = useStore((s) => s.prefs);
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
  const streak = logged ? currentStreak(logged, today) : null;
  const lastWeek = addDays(weekStart(today), -7);
  const showReview = isToday && prefs.reviewDismissed !== lastWeek;

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
            {showReview && <WeeklyReview profile={profile} weekStart={lastWeek} dismissible />}
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
                      <Icon name="snack" size={20} />
                    </span>
                    <span class="figure__text">
                      <span class="figure__label">Consommé</span>{' '}
                      <span class="figure__value">
                        {fmtInt(total.kcal)} <small>kcal</small>
                      </span>
                    </span>
                  </p>
                  <p class="figure">
                    <span class="figure__icon figure__icon--streak" aria-hidden="true">
                      <Icon name="flame" size={20} />
                    </span>
                    <span class="figure__text">
                      <span class="figure__label">Série</span>{' '}
                      <span class="figure__value">
                        {streak == null ? '…' : streak === 0 ? 'À lancer' : streak}{' '}
                        {streak != null && streak > 0 && <small>jour{streak > 1 ? 's' : ''}</small>}
                      </span>
                    </span>
                  </p>
                </div>
              </div>
              <hr class="divider" />
              <Macros value={total} target={targets} />
              <Micros entries={list} />
              <p class="sr-only" aria-live="polite" aria-atomic="true">
                {label} : {fmtInt(total.kcal)} kcal sur {fmtInt(targets.kcal)}.{' '}
                {total.kcal <= targets.kcal
                  ? `Reste ${fmtInt(targets.kcal - total.kcal)} kcal.`
                  : `Dépassement de ${fmtInt(total.kcal - targets.kcal)} kcal.`}{' '}
                Protéines {fmtInt(total.protein)} g sur {fmtInt(targets.protein)}.
              </p>
            </section>

            <WaterCard date={date} />

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
        <div class="meal__more">
          {previous.length > 0 && (
            <button
              type="button"
              class="btn btn--plain btn--sm"
              onClick={() => void copyMeal(addDays(date, -1), date, meal)}
            >
              <Icon name="copy" size={18} />
              Copier la veille
            </button>
          )}
          {entries.length > 0 && (
            <button
              type="button"
              class="icon-btn icon-btn--filled"
              aria-label={`Enregistrer comme repas type : ${label}`}
              onClick={() => store.set({ overlay: { kind: 'save-meal', meal, date } })}
            >
              <Icon name="bookmark" size={18} />
            </button>
          )}
        </div>
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
            {entry.kind === 'quick' ? 'Ajout rapide' : `${fmtDec(entry.grams)} g`}
            {entry.brand ? ` · ${entry.brand}` : ''}
          </span>
        </span>
        <span class="row__value">
          {fmtInt(n.kcal)} <small>kcal</small>
        </span>
      </button>
    </li>
  );
}

const MICROS: Micro[] = ['fiber', 'sugars', 'salt'];

/** Fibre, sugars and salt with their reference values. */
function Micros({ entries }: { entries: Entry[] }) {
  if (!entries.length) return null;
  const m = microTotals(entries);
  const partial = MICROS.some((k) => !m[k].complete);
  return (
    <div class="micros-wrap">
      <div class="micros">
        {MICROS.map((k) => {
          const ref = MICRO_REF[k];
          const v = m[k].value;
          const ratio = Math.min(v / ref.ref, 1);
          const over = ref.kind === 'max' && v > ref.ref;
          const done = ref.kind === 'min' && v >= ref.ref;
          return (
            <div class="micro" key={k}>
              <span class="micro__label">
                {ref.label}
                {!m[k].complete && <span aria-hidden="true">*</span>}
              </span>
              <span class={`micro__val ${over ? 'warn-text' : ''}`}>
                {fmtDec(v)} <span>/ {ref.ref} g</span>
              </span>
              <div class="bar bar--thin" aria-hidden="true">
                <div
                  class={`bar__fill ${over ? 'micro-fill--over' : done ? 'bg-accent' : 'micro-fill'}`}
                  style={{ transform: `scaleX(${ratio})` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {partial && <p class="footnote">* Certains aliments n'indiquent pas cette valeur : total minimum.</p>}
    </div>
  );
}

const litres = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const fmtL = (ml: number) => `${litres.format(ml / 1000)} L`;

function WaterCard({ date }: { date: ISODate }) {
  const ml = useStore((s) => s.water[date] ?? 0);
  const prefs = useStore((s) => s.prefs);
  useEffect(() => {
    void ensureWater(date);
  }, [date]);
  const glasses = Math.max(1, Math.ceil(prefs.waterGoalMl / prefs.glassMl));
  const filled = Math.min(glasses, Math.floor(ml / prefs.glassMl + 0.001));
  const done = ml >= prefs.waterGoalMl;
  return (
    <section class="card water" aria-labelledby="water-h">
      <div class="water__head">
        <span class="meal__icon water__icon" aria-hidden="true">
          <Icon name="drop" size={22} />
        </span>
        <div class="meal__titles">
          <h2 class="meal__title" id="water-h">
            Eau
          </h2>
          <p class="meal__meta" aria-live="polite">
            {fmtL(ml)} sur {fmtL(prefs.waterGoalMl)}
            {done ? ' · objectif atteint' : ''}
          </p>
        </div>
        <button
          type="button"
          class="icon-btn icon-btn--filled"
          aria-label={`Retirer un verre de ${prefs.glassMl} ml`}
          disabled={ml <= 0}
          onClick={() => addWater(date, -prefs.glassMl)}
        >
          <Icon name="minus" size={18} stroke={2.4} />
        </button>
        <button
          type="button"
          class="btn btn--sm water__add"
          aria-label={`Ajouter un verre de ${prefs.glassMl} ml`}
          onClick={() => addWater(date, prefs.glassMl)}
        >
          <Icon name="plus" size={18} stroke={2.4} />
          {prefs.glassMl} ml
        </button>
      </div>
      <div class="water__glasses" aria-hidden="true">
        {Array.from({ length: glasses }, (_, i) => (
          <span key={i} class={`water__glass ${i < filled ? 'water__glass--full' : ''}`}>
            <Icon name="glass" size={22} filled={i < filled} stroke={1.6} />
          </span>
        ))}
      </div>
    </section>
  );
}

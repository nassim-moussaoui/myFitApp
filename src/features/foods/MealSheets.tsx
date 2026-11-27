import { useState } from 'preact/hooks';
import { addSavedMeal, deleteMeal, ensureMeals, saveMeal, toPortion } from '../../app/extras';
import { showToast, useStore } from '../../app/store';
import type { Portion, SavedMeal } from '../../lib/db/schema';
import type { ISODate } from '../../lib/date';
import { fmtDec, fmtInt } from '../../lib/format';
import { scaleNutrients, totalOf } from '../../lib/nutrition/food';
import { mealLabel, type MealId } from '../../lib/nutrition/types';
import { Field } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';

const DEFAULT_NAME: Record<MealId, string> = {
  breakfast: 'Mon petit-déjeuner',
  lunch: 'Mon déjeuner',
  dinner: 'Mon dîner',
  snack: 'Ma collation',
};

/** Saves the entries of a meal as a reusable template. */
export default function SaveMealSheet({ meal, date, onClose }: { meal: MealId; date: ISODate; onClose: () => void }) {
  const entries = useStore((s) => (s.days[date] ?? []).filter((e) => e.meal === meal));
  const [name, setName] = useState(DEFAULT_NAME[meal]);
  const [error, setError] = useState<string | null>(null);
  const total = totalOf(entries);
  return (
    <Sheet title="Enregistrer comme repas type" subtitle={`${mealLabel(meal)} · ${fmtInt(total.kcal)} kcal`} onClose={onClose}>
      <form
        class="sheet__content"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError('Donne un nom à ce repas.');
            return;
          }
          await ensureMeals();
          saveMeal(name, entries.map(toPortion));
          showToast(`« ${name.trim()} » enregistré dans Repas types`);
          onClose();
        }}
      >
        <Field label="Nom du repas" value={name} onValue={(v) => { setName(v); setError(null); }} autoComplete="off" error={error} />
        <MealItems items={entries} />
        <p class="footnote">Il apparaîtra dans « Repas types » pour l'ajouter en un geste.</p>
        <button type="submit" class="btn btn--primary btn--block">
          Enregistrer
        </button>
      </form>
    </Sheet>
  );
}

function MealItems({ items }: { items: Portion[] }) {
  return (
    <ul class="card card--flush list inset-list">
      {items.map((it, i) => (
        <li class="row" key={i}>
          <span class="row__main">
            <span class="row__title">{it.name}</span>
            <span class="row__sub">{it.foodId === 'quick' ? 'Ajout rapide' : `${fmtDec(it.grams)} g`}</span>
          </span>
          <span class="row__value">
            {fmtInt(scaleNutrients(it.per100, it.grams).kcal)} <small>kcal</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Details of a saved meal: add it or delete the template. */
export function MealTemplateSheet({
  meal,
  target,
  date,
  onAdded,
  onClose,
}: {
  meal: SavedMeal;
  target: MealId;
  date: ISODate;
  onAdded: () => void;
  onClose: () => void;
}) {
  const t = totalOf(meal.items);
  return (
    <Sheet
      title={meal.name}
      subtitle={`${meal.items.length} élément${meal.items.length > 1 ? 's' : ''} · ${fmtInt(t.kcal)} kcal · P ${fmtInt(t.protein)} g`}
      onClose={onClose}
    >
      <div class="sheet__content">
        <MealItems items={meal.items} />
        <div class="stack stack--tight">
          <button
            type="button"
            class="btn btn--primary btn--block"
            onClick={() => {
              void addSavedMeal(meal, target, date);
              onAdded();
            }}
          >
            Ajouter au {mealLabel(target).toLowerCase()}
          </button>
          <button
            type="button"
            class="btn btn--danger-soft btn--block"
            onClick={() => {
              deleteMeal(meal);
              onClose();
            }}
          >
            <Icon name="trash" size={20} />
            Supprimer ce repas type
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function SavedMealRow({
  meal,
  onOpen,
  onQuickAdd,
}: {
  meal: SavedMeal;
  onOpen: (m: SavedMeal) => void;
  onQuickAdd: (m: SavedMeal) => void;
}) {
  const t = totalOf(meal.items);
  return (
    <li class="food-row">
      <button type="button" class="row" onClick={() => onOpen(meal)}>
        <span class="thumb thumb--accent" aria-hidden="true">
          <Icon name="bookmark" size={20} />
        </span>
        <span class="row__main">
          <span class="row__title">{meal.name}</span>
          <span class="row__sub">
            {meal.items.length} élément{meal.items.length > 1 ? 's' : ''} · {fmtInt(t.kcal)} kcal
          </span>
        </span>
      </button>
      <button
        type="button"
        class="icon-btn icon-btn--tint"
        aria-label={`Ajouter le repas ${meal.name}`}
        onClick={() => onQuickAdd(meal)}
      >
        <Icon name="plus" size={20} stroke={2.6} />
      </button>
    </li>
  );
}

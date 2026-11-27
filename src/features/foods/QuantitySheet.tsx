import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Food } from '../../lib/db/schema';
import { fmtDec, fmtInt, parseDecimal, toInputString } from '../../lib/format';
import { scaleNutrients } from '../../lib/nutrition/food';
import { MEALS, type MealId } from '../../lib/nutrition/types';
import { Field, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { Thumb } from './FoodRow';

interface Props {
  food: Food;
  grams: number;
  meal: MealId;
  mode: 'add' | 'edit';
  onConfirm: (grams: number, meal: MealId) => void;
  onClose: () => void;
  onDelete?: () => void;
  onToggleFavorite?: (fav: boolean) => void;
  onEditFood?: () => void;
}

const QUICK = [50, 100, 150, 200];

export function QuantitySheet(p: Props) {
  const [gramsText, setGramsText] = useState(toInputString(p.grams));
  const [meal, setMeal] = useState<MealId>(p.meal);
  const [fav, setFav] = useState(!!p.food.favorite);
  useEffect(() => setFav(!!p.food.favorite), [p.food.favorite]);
  const grams = parseDecimal(gramsText);
  const valid = grams != null && grams > 0 && grams <= 5000;
  const n = useMemo(() => scaleNutrients(p.food.per100, valid ? grams : 0), [p.food, grams, valid]);
  const per = p.food.per100;

  const chips = QUICK.map((g) => ({ g, label: `${g} g` }));
  if (p.food.servingGrams) {
    chips.push({ g: p.food.servingGrams, label: `1 portion · ${fmtDec(p.food.servingGrams)} g` });
  }

  return (
    <Sheet
      title={p.food.name}
      subtitle={p.food.brand}
      onClose={p.onClose}
      headerExtra={
        p.onToggleFavorite && (
          <button
            type="button"
            class={`icon-btn icon-btn--filled ${fav ? 'icon-btn--fav' : ''}`}
            aria-pressed={fav}
            aria-label="Favori"
            onClick={() => {
              setFav(!fav);
              p.onToggleFavorite?.(!fav);
            }}
          >
            <Icon name="star" size={20} filled={fav} />
          </button>
        )
      }
    >
      <form
        class="sheet__content"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) p.onConfirm(Math.round(grams * 10) / 10, meal);
        }}
      >
        <div class="food-hero">
          <Thumb url={p.food.imageUrl} />
          <p class="food-hero__per">
            Pour 100 g : {fmtInt(per.kcal)} kcal · P {fmtDec(per.protein)} · G {fmtDec(per.carbs)} · L{' '}
            {fmtDec(per.fat)}
          </p>
        </div>

        <div class="stack stack--tight">
          <Field
            label="Quantité"
            value={gramsText}
            onValue={setGramsText}
            suffix="g"
            decimal
            error={gramsText !== '' && !valid ? 'Entre 1 et 5000 g.' : null}
          />
          <div class="chips" role="group" aria-label="Quantités rapides">
            {chips.map((c) => (
              <button
                type="button"
                key={c.label}
                class="chip"
                aria-pressed={grams === c.g}
                onClick={() => setGramsText(toInputString(c.g))}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div class="stack stack--tight">
          <div class="nutri-box" aria-live="polite" aria-atomic="true">
            <div class="nutri nutri--kcal">
              <span class="nutri__label">Calories</span>
              <span class="nutri__val">
                {fmtInt(n.kcal)} <small>kcal</small>
              </span>
            </div>
            <div class="nutri">
              <span class="nutri__label">
                <span class="macro__dot bg-protein" aria-hidden="true" />
                <span aria-hidden="true">Prot.</span>
                <span class="sr-only">Protéines</span>
              </span>
              <span class="nutri__val">
                {fmtDec(n.protein)} <small>g</small>
              </span>
            </div>
            <div class="nutri">
              <span class="nutri__label">
                <span class="macro__dot bg-carbs" aria-hidden="true" />
                <span aria-hidden="true">Gluc.</span>
                <span class="sr-only">Glucides</span>
              </span>
              <span class="nutri__val">
                {fmtDec(n.carbs)} <small>g</small>
              </span>
            </div>
            <div class="nutri">
              <span class="nutri__label">
                <span class="macro__dot bg-fat" aria-hidden="true" />
                <span aria-hidden="true">Lip.</span>
                <span class="sr-only">Lipides</span>
              </span>
              <span class="nutri__val">
                {fmtDec(n.fat)} <small>g</small>
              </span>
            </div>
          </div>
          {(n.sugars != null || n.fiber != null || n.salt != null) && (
            <p class="nutri-extra">
              {[
                n.sugars != null && `Sucres ${fmtDec(n.sugars)} g`,
                n.fiber != null && `Fibres ${fmtDec(n.fiber)} g`,
                n.salt != null && `Sel ${fmtDec(n.salt)} g`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>

        <Segmented
          legend="Repas"
          value={meal}
          onChange={setMeal}
          options={MEALS.map((m) => ({ value: m.id, label: m.short }))}
        />

        <div class="stack stack--tight">
          <button type="submit" class="btn btn--primary btn--block" disabled={!valid}>
            {p.mode === 'add' ? 'Ajouter' : 'Enregistrer'}
          </button>
          {(p.onDelete || p.onEditFood) && (
            <div class="btn-row">
              {p.onEditFood && (
                <button type="button" class="btn btn--secondary btn--sm" onClick={p.onEditFood}>
                  <Icon name="edit" size={18} />
                  Modifier l'aliment
                </button>
              )}
              {p.onDelete && (
                <button type="button" class="btn btn--danger-soft btn--sm" onClick={p.onDelete}>
                  <Icon name="trash" size={18} />
                  Supprimer
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </Sheet>
  );
}

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

  const chips = [...QUICK.map((g) => ({ g, label: `${g} g` }))];
  if (p.food.servingGrams) {
    chips.push({ g: p.food.servingGrams, label: `1 portion (${fmtDec(p.food.servingGrams)} g)` });
  }

  return (
    <Sheet
      title={p.food.name}
      onClose={p.onClose}
      headerExtra={
        p.onToggleFavorite && (
          <button
            type="button"
            class={`icon-btn ${fav ? 'icon-btn--fav' : ''}`}
            aria-pressed={fav}
            aria-label="Favori"
            onClick={() => {
              setFav(!fav);
              p.onToggleFavorite?.(!fav);
            }}
          >
            <Icon name="star" filled={fav} />
          </button>
        )
      }
    >
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) p.onConfirm(Math.round(grams * 10) / 10, meal);
        }}
      >
        <div class="food-head">
          <Thumb url={p.food.imageUrl} />
          <div>
            {p.food.brand && <p class="food-head__brand">{p.food.brand}</p>}
            <p class="food-head__per">
              Pour 100 g : {fmtInt(per.kcal)} kcal · P {fmtDec(per.protein)} · G {fmtDec(per.carbs)} · L{' '}
              {fmtDec(per.fat)}
            </p>
          </div>
        </div>

        <Field
          label="Quantité"
          value={gramsText}
          onValue={setGramsText}
          suffix="g"
          decimal
          error={gramsText !== '' && !valid ? 'Quantité entre 1 et 5000 g.' : null}
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

        <div class="nutri-box" aria-live="polite" aria-atomic="true">
          <div class="nutri-box__kcal">
            <strong>{fmtInt(n.kcal)}</strong> kcal
          </div>
          <dl class="nutri-box__macros">
            <div>
              <dt>Protéines</dt>
              <dd>{fmtDec(n.protein)} g</dd>
            </div>
            <div>
              <dt>Glucides</dt>
              <dd>{fmtDec(n.carbs)} g</dd>
            </div>
            <div>
              <dt>Lipides</dt>
              <dd>{fmtDec(n.fat)} g</dd>
            </div>
          </dl>
          {(n.sugars != null || n.fiber != null || n.salt != null) && (
            <p class="nutri-box__extra">
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

        <button type="submit" class="btn btn--primary btn--block" disabled={!valid}>
          {p.mode === 'add' ? 'Ajouter' : 'Enregistrer'}
        </button>
        {(p.onDelete || p.onEditFood) && (
          <div class="row-actions">
            {p.onEditFood && (
              <button type="button" class="btn btn--ghost" onClick={p.onEditFood}>
                <Icon name="edit" size={20} />
                Modifier l'aliment
              </button>
            )}
            {p.onDelete && (
              <button type="button" class="btn btn--danger-ghost" onClick={p.onDelete}>
                <Icon name="trash" size={20} />
                Supprimer
              </button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}

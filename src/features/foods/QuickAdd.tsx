import { useState } from 'preact/hooks';
import { fmtInt, parseDecimal, toInputString } from '../../lib/format';
import { kcalFromMacros } from '../../lib/nutrition/targets';
import { MEALS, type MealId } from '../../lib/nutrition/types';
import type { QuickValues } from '../../app/extras';
import { Field, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';

interface Props {
  initial?: Partial<QuickValues>;
  meal: MealId;
  mode: 'add' | 'edit';
  onConfirm: (v: QuickValues, meal: MealId) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Raw calories (restaurant, unknown dish): no food to create. */
export function QuickAddSheet({ initial, meal: initialMeal, mode, onConfirm, onDelete, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kcal, setKcal] = useState(toInputString(initial?.kcal, 0));
  const [p, setP] = useState(toInputString(initial?.protein));
  const [c, setC] = useState(toInputString(initial?.carbs));
  const [f, setF] = useState(toInputString(initial?.fat));
  const [meal, setMeal] = useState<MealId>(initialMeal);
  const [showErrors, setShowErrors] = useState(false);

  const num = (t: string) => (t.trim() === '' ? 0 : parseDecimal(t));
  const pv = num(p);
  const cv = num(c);
  const fv = num(f);
  const implied = pv != null && cv != null && fv != null ? kcalFromMacros({ protein: pv, carbs: cv, fat: fv }) : 0;
  const kv = kcal.trim() === '' ? (implied > 0 ? implied : null) : parseDecimal(kcal);
  const macroErr = (v: number | null) => (v == null || v < 0 || v > 500 ? 'Entre 0 et 500 g.' : null);
  const errors = {
    kcal: kv == null || kv <= 0 || kv > 5000 ? 'Indique les calories (1 à 5000 kcal).' : null,
    p: macroErr(pv),
    c: macroErr(cv),
    f: macroErr(fv),
  };
  const ok = !errors.kcal && !errors.p && !errors.c && !errors.f;
  const show = (e: string | null) => (showErrors ? e : null);

  return (
    <Sheet title={mode === 'add' ? 'Ajout rapide' : "Modifier l'ajout rapide"} subtitle="Juste des calories, sans créer d'aliment" onClose={onClose}>
      <form
        class="sheet__content"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setShowErrors(true);
          if (!ok) return;
          onConfirm(
            { name, kcal: Math.round(kv!), protein: pv ?? 0, carbs: cv ?? 0, fat: fv ?? 0 },
            meal,
          );
        }}
      >
        <Field label="Nom (facultatif)" value={name} onValue={setName} placeholder="Ex. : restaurant, pizza" autoComplete="off" />
        <Field
          label="Calories"
          value={kcal}
          onValue={setKcal}
          suffix="kcal"
          decimal
          placeholder={implied > 0 ? String(implied) : undefined}
          hint={kcal === '' && implied > 0 ? `Calculé depuis les macros : ${fmtInt(implied)} kcal` : undefined}
          error={show(errors.kcal)}
        />
        <fieldset class="stack stack--tight">
          <legend class="field__label" style={{ marginBottom: '0.375rem' }}>
            Macros (facultatif)
          </legend>
          <div class="grid-3">
            <Field label="Protéines" value={p} onValue={setP} suffix="g" decimal error={show(errors.p)} />
            <Field label="Glucides" value={c} onValue={setC} suffix="g" decimal error={show(errors.c)} />
            <Field label="Lipides" value={f} onValue={setF} suffix="g" decimal error={show(errors.f)} />
          </div>
        </fieldset>
        <Segmented
          legend="Repas"
          value={meal}
          onChange={setMeal}
          options={MEALS.map((m) => ({ value: m.id, label: m.short }))}
        />
        <div class="stack stack--tight">
          <button type="submit" class="btn btn--primary btn--block">
            {mode === 'add' ? 'Ajouter' : 'Enregistrer'}
          </button>
          {onDelete && (
            <button type="button" class="btn btn--danger-soft btn--block" onClick={onDelete}>
              <Icon name="trash" size={20} />
              Supprimer
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

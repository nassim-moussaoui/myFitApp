import { useState } from 'preact/hooks';
import { newId } from '../../app/actions';
import type { Food } from '../../lib/db/schema';
import { fmtInt, parseDecimal, toInputString } from '../../lib/format';
import { isPlausiblePer100 } from '../../lib/nutrition/food';
import { kcalFromMacros } from '../../lib/nutrition/targets';
import type { Nutrients } from '../../lib/nutrition/types';
import type { CoreNutrient } from '../../lib/off/api';
import { Field } from '../../ui/controls';
import { Sheet } from '../../ui/Sheet';

interface Props {
  initial?: Partial<Food>;
  missing?: CoreNutrient[];
  note?: string;
  onSave: (food: Food) => void;
  onClose: () => void;
}

type Key = 'kcal' | 'protein' | 'carbs' | 'fat' | 'sugars' | 'fiber' | 'salt';

const LABELS: Record<Key, string> = {
  kcal: 'Calories',
  protein: 'Protéines',
  carbs: 'Glucides',
  fat: 'Lipides',
  sugars: 'dont sucres',
  fiber: 'Fibres',
  salt: 'Sel',
};

/** Create a custom food, edit one, or complete an incomplete Open Food Facts product. */
export function FoodEditor({ initial, missing = [], note, onSave, onClose }: Props) {
  const per = initial?.per100;
  const start = (k: Key): string => {
    if (missing.includes(k as CoreNutrient)) return '';
    const v = per?.[k];
    return v == null ? '' : toInputString(v, 2);
  };
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [vals, setVals] = useState<Record<Key, string>>({
    kcal: start('kcal'),
    protein: start('protein'),
    carbs: start('carbs'),
    fat: start('fat'),
    sugars: start('sugars'),
    fiber: start('fiber'),
    salt: start('salt'),
  });
  const [serving, setServing] = useState(toInputString(initial?.servingGrams, 0));
  const [showErrors, setShowErrors] = useState(false);
  const [moreOpen, setMoreOpen] = useState(
    initial?.per100?.sugars != null || initial?.per100?.fiber != null || initial?.per100?.salt != null,
  );

  const num = (k: Key) => parseDecimal(vals[k]);
  const p = num('protein');
  const c = num('carbs');
  const f = num('fat');
  const implied = p != null && c != null && f != null ? kcalFromMacros({ protein: p, carbs: c, fat: f }) : null;
  const kcal = num('kcal') ?? implied;

  const errors: Partial<Record<Key | 'name' | 'serving' | 'global', string>> = {};
  if (!name.trim()) errors.name = 'Donne un nom à cet aliment.';
  for (const k of ['protein', 'carbs', 'fat'] as const) {
    const v = num(k);
    if (v == null || v < 0 || v > 100) errors[k] = 'Valeur entre 0 et 100 g.';
  }
  if (kcal == null || kcal < 0 || kcal > 950) errors.kcal = 'Valeur entre 0 et 950 kcal.';
  for (const k of ['sugars', 'fiber', 'salt'] as const) {
    if (vals[k] !== '' && (num(k) == null || num(k)! < 0 || num(k)! > 100)) errors[k] = 'Valeur entre 0 et 100 g.';
  }
  const servingNum = parseDecimal(serving);
  if (serving !== '' && (servingNum == null || servingNum <= 0 || servingNum > 2000)) {
    errors.serving = 'Portion entre 1 et 2000 g.';
  }
  const per100: Partial<Nutrients> = { kcal: kcal ?? undefined, protein: p ?? undefined, carbs: c ?? undefined, fat: f ?? undefined };
  if (!errors.kcal && !errors.protein && !errors.carbs && !errors.fat && !isPlausiblePer100(per100)) {
    errors.global = 'Protéines, glucides et lipides dépassent 100 g pour 100 g.';
  }
  const ok = Object.keys(errors).length === 0;

  const set = (k: Key) => (v: string) => setVals((s) => ({ ...s, [k]: v }));
  const err = (k: keyof typeof errors) => (showErrors ? errors[k] : null);

  return (
    <Sheet title={initial?.source === 'custom' && initial.id ? "Modifier l'aliment" : 'Nouvel aliment'} onClose={onClose}>
      <form
        class="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement;
          setShowErrors(true);
          if (!ok) {
            requestAnimationFrame(() => form.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
            return;
          }
          const now = Date.now();
          const n: Nutrients = { kcal: Math.round(kcal!), protein: p!, carbs: c!, fat: f! };
          for (const k of ['sugars', 'fiber', 'salt'] as const) if (vals[k] !== '') n[k] = num(k)!;
          const isOwn = initial?.source === 'custom' && !!initial.id;
          const food: Food = {
            id: isOwn ? initial!.id! : `c:${newId()}`,
            source: 'custom',
            code: initial?.code,
            name: name.trim().slice(0, 120),
            brand: brand.trim() || undefined,
            per100: n,
            servingGrams: servingNum ?? undefined,
            imageUrl: initial?.imageUrl,
            favorite: initial?.favorite,
            lastUsedAt: initial?.lastUsedAt,
            lastGrams: initial?.lastGrams,
            useCount: initial?.useCount,
            createdAt: isOwn ? (initial!.createdAt ?? now) : now,
            updatedAt: now,
          };
          onSave(food);
        }}
      >
        {note && <p class="notice">{note}</p>}
        <Field label="Nom" value={name} onValue={setName} autoComplete="off" error={err('name')} />
        <Field label="Marque (facultatif)" value={brand} onValue={setBrand} autoComplete="off" />
        {initial?.code && <p class="muted small">Code-barres : {initial.code}</p>}

        <p class="field__label">Valeurs pour 100 g</p>
        <div class="grid-2">
          <Field
            label={LABELS.kcal}
            value={vals.kcal}
            onValue={set('kcal')}
            suffix="kcal"
            decimal
            placeholder={implied != null ? String(implied) : undefined}
            hint={vals.kcal === '' && implied != null ? `Calculé : ${fmtInt(implied)} kcal` : undefined}
            error={err('kcal')}
          />
          <Field label={LABELS.protein} value={vals.protein} onValue={set('protein')} suffix="g" decimal error={err('protein')} />
          <Field label={LABELS.carbs} value={vals.carbs} onValue={set('carbs')} suffix="g" decimal error={err('carbs')} />
          <Field label={LABELS.fat} value={vals.fat} onValue={set('fat')} suffix="g" decimal error={err('fat')} />
        </div>
        {showErrors && errors.global && (
          <p class="field__error" role="alert">
            {errors.global}
          </p>
        )}

        <button type="button" class="link-btn" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
          {moreOpen ? 'Masquer les détails' : 'Sucres, fibres, sel, portion'}
        </button>
        {moreOpen && (
          <div class="grid-2">
            <Field label={LABELS.sugars} value={vals.sugars} onValue={set('sugars')} suffix="g" decimal error={err('sugars')} />
            <Field label={LABELS.fiber} value={vals.fiber} onValue={set('fiber')} suffix="g" decimal error={err('fiber')} />
            <Field label={LABELS.salt} value={vals.salt} onValue={set('salt')} suffix="g" decimal error={err('salt')} />
            <Field label="Portion" value={serving} onValue={setServing} suffix="g" decimal error={err('serving')} />
          </div>
        )}

        <button type="submit" class="btn btn--primary btn--block">
          Enregistrer
        </button>
      </form>
    </Sheet>
  );
}

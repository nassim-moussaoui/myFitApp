import { useEffect, useId, useMemo, useState } from 'preact/hooks';
import { newId, saveFood } from '../../app/actions';
import { allFoods } from '../../lib/db';
import type { Food, Portion } from '../../lib/db/schema';
import { fmtDec, fmtInt, parseDecimal, toInputString } from '../../lib/format';
import { recipePer100, scaleNutrients, totalOf } from '../../lib/nutrition/food';
import { OffError } from '../../lib/off/api';
import { normalizeQuery, offErrorMessage, searchOff } from '../../lib/off/search';
import { Field } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { SkeletonRows } from '../../ui/Progress';
import { Sheet } from '../../ui/Sheet';
import { Thumb } from './FoodRow';

/** Create or edit a home recipe: ingredients, cooked weight, portions. Saved as a custom food. */
export function RecipeEditor({
  initial,
  onSave,
  onClose,
}: {
  initial?: Food;
  onSave: (food: Food) => void;
  onClose: () => void;
}) {
  const r = initial?.recipe;
  const [name, setName] = useState(initial?.name ?? '');
  const [items, setItems] = useState<Portion[]>(r?.ingredients ?? []);
  const [cooked, setCooked] = useState(r ? toInputString(r.cookedGrams, 0) : '');
  const [portions, setPortions] = useState(r?.portions ? String(r.portions) : '');
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const rawGrams = items.reduce((a, i) => a + i.grams, 0);
  const cookedNum = cooked.trim() === '' ? rawGrams : parseDecimal(cooked);
  const portionsNum = portions.trim() === '' ? null : parseDecimal(portions);
  const total = totalOf(items);
  const per100 = cookedNum && cookedNum > 0 ? recipePer100(items, cookedNum) : null;
  const perPortion = per100 && portionsNum && portionsNum > 0 ? scaleNutrients(per100, cookedNum! / portionsNum) : null;

  const errors = {
    name: !name.trim() ? 'Donne un nom à ta recette.' : null,
    items: items.length === 0 ? 'Ajoute au moins un ingrédient.' : null,
    cooked: cookedNum == null || cookedNum <= 0 || cookedNum > 20000 ? 'Poids entre 1 et 20 000 g.' : null,
    portions: portions.trim() !== '' && (portionsNum == null || portionsNum < 1 || portionsNum > 50) ? 'Entre 1 et 50.' : null,
  };
  const ok = !errors.name && !errors.items && !errors.cooked && !errors.portions;
  const show = (e: string | null) => (showErrors ? e : null);

  return (
    <>
      <Sheet title={initial ? 'Modifier la recette' : 'Nouvelle recette'} full onClose={onClose} class="recipe">
        <form
          class="sheet__content"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setShowErrors(true);
            if (!ok || !per100) return;
            const now = Date.now();
            const food: Food = {
              ...(initial ?? {}),
              id: initial?.id ?? `c:${newId()}`,
              source: 'custom',
              name: name.trim().slice(0, 120),
              per100,
              servingGrams: portionsNum ? Math.round(cookedNum! / portionsNum) : undefined,
              servingLabel: portionsNum ? '1 part' : undefined,
              recipe: { ingredients: items, cookedGrams: Math.round(cookedNum!), portions: portionsNum ?? undefined },
              createdAt: initial?.createdAt ?? now,
              updatedAt: now,
            };
            onSave(food);
          }}
        >
          <Field label="Nom de la recette" value={name} onValue={setName} autoComplete="off" error={show(errors.name)} />

          <section class="group" aria-labelledby="rc-ing">
            <div class="group-head">
              <h3 class="group-title" id="rc-ing">
                Ingrédients (cru)
              </h3>
              <span class="footnote num">
                {fmtInt(rawGrams)} g · {fmtInt(total.kcal)} kcal
              </span>
            </div>
            {items.length > 0 && (
              <ul class="card card--flush list">
                {items.map((it, i) => (
                  <li key={`${it.foodId}-${i}`}>
                    <button type="button" class="row" onClick={() => setEditing(i)}>
                      <span class="row__main">
                        <span class="row__title">{it.name}</span>
                        <span class="row__sub">{fmtDec(it.grams)} g</span>
                      </span>
                      <span class="row__value">
                        {fmtInt(scaleNutrients(it.per100, it.grams).kcal)} <small>kcal</small>
                      </span>
                      <span class="row__chev" aria-hidden="true">
                        <Icon name="chevron" size={18} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {show(errors.items) && <p class="field__error">{errors.items}</p>}
            <button type="button" class="btn btn--secondary btn--block" onClick={() => setPicking(true)}>
              <Icon name="plus" size={20} stroke={2.4} />
              Ajouter un ingrédient
            </button>
          </section>

          <div class="grid-2">
            <Field
              label="Poids total cuit"
              value={cooked}
              onValue={setCooked}
              suffix="g"
              decimal
              placeholder={rawGrams > 0 ? String(Math.round(rawGrams)) : undefined}
              error={show(errors.cooked)}
            />
            <Field
              label="Nombre de parts"
              value={portions}
              onValue={setPortions}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Facultatif"
              error={show(errors.portions)}
            />
          </div>
          <p class="footnote">
            Pèse le plat une fois cuit : l'eau absorbée (riz, pâtes) ou évaporée change les valeurs pour 100 g. Sans
            pesée, le poids cru est utilisé.
          </p>

          {per100 && items.length > 0 && (
            <div class="card preview">
              <p class="preview__label">Pour 100 g</p>
              <div class="tiles tiles--4">
                <div class="tile">
                  <span class="tile__label">kcal</span>
                  <span class="tile__value">{fmtInt(per100.kcal)}</span>
                </div>
                <div class="tile">
                  <span class="tile__label">Prot.</span>
                  <span class="tile__value">
                    {fmtDec(per100.protein)} <small>g</small>
                  </span>
                </div>
                <div class="tile">
                  <span class="tile__label">Gluc.</span>
                  <span class="tile__value">
                    {fmtDec(per100.carbs)} <small>g</small>
                  </span>
                </div>
                <div class="tile">
                  <span class="tile__label">Lip.</span>
                  <span class="tile__value">
                    {fmtDec(per100.fat)} <small>g</small>
                  </span>
                </div>
              </div>
              {perPortion && (
                <p class="muted">
                  Une part ({fmtInt(cookedNum! / portionsNum!)} g) : <strong>{fmtInt(perPortion.kcal)} kcal</strong>, P{' '}
                  {fmtDec(perPortion.protein)} g, G {fmtDec(perPortion.carbs)} g, L {fmtDec(perPortion.fat)} g
                </p>
              )}
            </div>
          )}

          <button type="submit" class="btn btn--primary btn--block">
            Enregistrer la recette
          </button>
        </form>
      </Sheet>

      {picking && (
        <IngredientPicker
          excludeId={initial?.id}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setItems((l) => [...l, p]);
            setPicking(false);
          }}
        />
      )}
      {editing != null && items[editing] && (
        <IngredientEdit
          item={items[editing]!}
          onClose={() => setEditing(null)}
          onSave={(grams) => {
            setItems((l) => l.map((x, i) => (i === editing ? { ...x, grams } : x)));
            setEditing(null);
          }}
          onDelete={() => {
            setItems((l) => l.filter((_, i) => i !== editing));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function GramsForm({
  initial,
  submitLabel,
  onSubmit,
  children,
}: {
  initial: number;
  submitLabel: string;
  onSubmit: (g: number) => void;
  children?: preact.ComponentChildren;
}) {
  const [text, setText] = useState(toInputString(initial));
  const g = parseDecimal(text);
  const valid = g != null && g > 0 && g <= 10000;
  return (
    <form
      class="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(Math.round(g * 10) / 10);
      }}
    >
      <Field label="Quantité (crue)" value={text} onValue={setText} suffix="g" decimal error={text && !valid ? 'Entre 1 et 10 000 g.' : null} />
      <div class="chips" role="group" aria-label="Quantités rapides">
        {[50, 100, 200, 500].map((q) => (
          <button type="button" key={q} class="chip" aria-pressed={g === q} onClick={() => setText(String(q))}>
            {q} g
          </button>
        ))}
      </div>
      <button type="submit" class="btn btn--primary btn--block" disabled={!valid}>
        {submitLabel}
      </button>
      {children}
    </form>
  );
}

function IngredientEdit({
  item,
  onSave,
  onDelete,
  onClose,
}: {
  item: Portion;
  onSave: (g: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={item.name} subtitle={`${fmtInt(item.per100.kcal)} kcal pour 100 g`} onClose={onClose}>
      <GramsForm initial={item.grams} submitLabel="Enregistrer" onSubmit={onSave}>
        <button type="button" class="btn btn--danger-soft btn--block" onClick={onDelete}>
          <Icon name="trash" size={20} />
          Retirer l'ingrédient
        </button>
      </GramsForm>
    </Sheet>
  );
}

/** Search an ingredient in saved foods and Open Food Facts. */
function IngredientPicker({
  excludeId,
  onPick,
  onClose,
}: {
  excludeId?: string;
  onPick: (p: Portion) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [remote, setRemote] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; items: Food[]; message?: string }>({
    status: 'idle',
    items: [],
  });
  const [chosen, setChosen] = useState<Food | null>(null);
  const searchId = useId();
  const q = normalizeQuery(query);

  useEffect(() => {
    void allFoods()
      .catch(() => [] as Food[])
      .then((l) => setFoods(l.filter((f) => f.id !== excludeId)));
  }, [excludeId]);

  useEffect(() => {
    if (q.length < 2) {
      setRemote({ status: 'idle', items: [] });
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setRemote({ status: 'loading', items: [] });
      searchOff(q, ctrl.signal)
        .then((r) => !ctrl.signal.aborted && setRemote({ status: 'done', items: r.items }))
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || (e instanceof OffError && e.kind === 'aborted')) return;
          setRemote({ status: 'error', items: [], message: offErrorMessage(e) });
        });
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const local = useMemo(() => {
    const words = q.split(' ').filter(Boolean);
    const list = words.length
      ? foods.filter((f) => words.every((w) => normalizeQuery(`${f.name} ${f.brand ?? ''}`).includes(w)))
      : [...foods].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    return list.slice(0, 12);
  }, [foods, q]);
  const remoteItems = remote.items.filter((r) => !local.some((l) => l.id === r.id));

  const row = (f: Food) => (
    <li key={f.id}>
      <button type="button" class="row" onClick={() => setChosen(f)}>
        <Thumb url={f.imageUrl} />
        <span class="row__main">
          <span class="row__title">{f.name}</span>
          <span class="row__sub">
            {f.brand ? `${f.brand} · ` : ''}
            {fmtInt(f.per100.kcal)} kcal / 100 g
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <>
      <Sheet title="Ajouter un ingrédient" full onClose={onClose}>
        <div class="sheet__content">
          <div class="searchbar__field">
            <Icon name="search" size={20} />
            <label class="sr-only" for={searchId}>
              Rechercher un ingrédient
            </label>
            <input
              id={searchId}
              class="input searchbar__input"
              type="search"
              placeholder="Rechercher un ingrédient"
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
              enterKeyHint="search"
              autoComplete="off"
            />
          </div>
          {local.length > 0 && (
            <section class="group" aria-label="Mes aliments">
              <h3 class="group-title">{q ? 'Mes aliments' : 'Récents'}</h3>
              <ul class="card card--flush list">{local.map(row)}</ul>
            </section>
          )}
          {q.length >= 2 && (
            <section class="group" aria-label="Open Food Facts" aria-busy={remote.status === 'loading'}>
              <h3 class="group-title">Open Food Facts</h3>
              {remote.status === 'loading' && (
                <div class="card card--flush">
                  <SkeletonRows count={4} />
                </div>
              )}
              {remote.status === 'error' && (
                <p class="notice notice--error" role="alert">
                  <span>{remote.message}</span>
                </p>
              )}
              {remote.status === 'done' && remoteItems.length === 0 && local.length === 0 && (
                <p class="footnote">Aucun résultat pour « {query.trim()} ».</p>
              )}
              {remoteItems.length > 0 && <ul class="card card--flush list">{remoteItems.map(row)}</ul>}
            </section>
          )}
        </div>
      </Sheet>
      {chosen && (
        <Sheet title={chosen.name} subtitle={`${fmtInt(chosen.per100.kcal)} kcal pour 100 g`} onClose={() => setChosen(null)}>
          <GramsForm
            initial={chosen.lastGrams ?? 100}
            submitLabel="Ajouter à la recette"
            onSubmit={(grams) => {
              if (!foods.some((f) => f.id === chosen.id)) saveFood(chosen);
              onPick({ foodId: chosen.id, name: chosen.name, brand: chosen.brand, grams, per100: chosen.per100 });
              setChosen(null);
            }}
          />
        </Sheet>
      )}
    </>
  );
}

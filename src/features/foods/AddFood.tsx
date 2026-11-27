import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { addEntry, removeEntry, saveFood } from '../../app/actions';
import { lazy } from '../../app/lazy';
import { addQuickEntry, addSavedMeal, ensureMeals } from '../../app/extras';
import { showToast, useStore } from '../../app/store';
import { allFoods, foodByCode } from '../../lib/db';
import type { Food, SavedMeal } from '../../lib/db/schema';
import type { ISODate } from '../../lib/date';
import { fmtDec } from '../../lib/format';
import { MEALS, mealLabel, type MealId } from '../../lib/nutrition/types';
import { OffError, fetchProduct, type CoreNutrient } from '../../lib/off/api';
import { normalizeQuery, offErrorMessage, searchOff } from '../../lib/off/search';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { SkeletonRows } from '../../ui/Progress';
import { Sheet } from '../../ui/Sheet';
import { ToastHost } from '../../ui/Toast';
import { FoodEditor } from './FoodEditor';
import { FoodRow, defaultGrams } from './FoodRow';
import { MealTemplateSheet, SavedMealRow } from './MealSheets';
import { QuantitySheet } from './QuantitySheet';
import { QuickAddSheet } from './QuickAdd';
import { RecipeEditor } from './RecipeEditor';

const Scanner = lazy(() => import('./Scanner'));

type Remote =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; items: Food[] }
  | { status: 'error'; message: string; autoRetry: boolean };

type Lookup = { code: string; status: 'loading' } | { code: string; status: 'notfound' | 'error'; message: string };

interface EditorState {
  initial?: Partial<Food>;
  missing?: CoreNutrient[];
  note?: string;
  /** After saving, open the quantity sheet to log it. */
  thenAdd: boolean;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  return online;
}

const matches = (f: Food, words: string[]) => {
  const hay = normalizeQuery(`${f.name} ${f.brand ?? ''}`);
  return words.every((w) => hay.includes(w));
};

export default function AddFood({ meal: initialMeal, date, onClose }: { meal: MealId; date: ISODate; onClose: () => void }) {
  const [meal, setMeal] = useState<MealId>(initialMeal);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [remote, setRemote] = useState<Remote>({ status: 'idle' });
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Food | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [recipe, setRecipe] = useState<{ initial?: Food } | null>(null);
  const [template, setTemplate] = useState<SavedMeal | null>(null);
  const savedMeals = useStore((s) => s.meals);
  const lookupCtrl = useRef<AbortController | null>(null);
  const online = useOnline();
  const searchId = useId();
  const q = normalizeQuery(query);

  useEffect(() => {
    // Warm up the connection to Open Food Facts while the user types.
    if (!document.querySelector('link[data-off]')) {
      const l = document.createElement('link');
      l.rel = 'preconnect';
      l.href = 'https://world.openfoodfacts.org';
      l.crossOrigin = 'anonymous';
      l.dataset.off = '';
      document.head.append(l);
    }
    void allFoods()
      .catch(() => [] as Food[])
      .then(setFoods);
    void Scanner.preload();
    void ensureMeals();
    return () => lookupCtrl.current?.abort();
  }, []);

  // Open Food Facts search: 400 ms debounce, previous request aborted on each keystroke.
  useEffect(() => {
    if (q.length < 2) {
      setRemote({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    let retryTimer = 0;
    const run = () => {
      setRemote({ status: 'loading' });
      searchOff(q, ctrl.signal)
        .then((r) => {
          if (!ctrl.signal.aborted) setRemote({ status: 'done', items: r.items });
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || (e instanceof OffError && e.kind === 'aborted')) return;
          const isRate = e instanceof OffError && e.kind === 'rate' && e.retryInMs > 0;
          setRemote({ status: 'error', message: offErrorMessage(e), autoRetry: isRate });
          if (isRate) retryTimer = window.setTimeout(run, (e as OffError).retryInMs + 250);
        });
    };
    const t = window.setTimeout(run, 400);
    return () => {
      clearTimeout(t);
      clearTimeout(retryTimer);
      ctrl.abort();
    };
  }, [q, retry]);

  const all = foods ?? [];
  const meals = useMemo(() => {
    const list = [...(savedMeals ?? [])].sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt));
    if (!q) return list;
    const words = q.split(' ');
    return list.filter((m) => words.every((w) => normalizeQuery(m.name).includes(w)));
  }, [savedMeals, q]);
  const addMeal = (m: SavedMeal) => {
    void addSavedMeal(m, meal, date);
  };

  const local = useMemo(() => {
    if (q.length < 1) return [];
    const words = q.split(' ');
    return all
      .filter((f) => matches(f, words))
      .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || (b.useCount ?? 0) - (a.useCount ?? 0))
      .slice(0, 12);
  }, [all, q]);
  const favorites = useMemo(
    () => all.filter((f) => f.favorite).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [all],
  );
  const recipes = useMemo(
    () => all.filter((f) => f.recipe).sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt)),
    [all],
  );
  const recents = useMemo(
    () =>
      all
        .filter((f) => f.lastUsedAt && !f.favorite && !f.recipe)
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
        .slice(0, 15),
    [all],
  );

  const upsertLocal = (f: Food) =>
    setFoods((list) => {
      const l = list ?? [];
      return l.some((x) => x.id === f.id) ? l.map((x) => (x.id === f.id ? f : x)) : [...l, f];
    });

  const open = (f: Food) => {
    const known = all.find((x) => x.id === f.id);
    if (!known) {
      // Remember every product looked at, so it works offline later.
      saveFood(f);
      upsertLocal(f);
    }
    setSelected(known ?? f);
  };

  const log = (f: Food, grams: number, m: MealId) => {
    const { entry, food } = addEntry(f, grams, m, date);
    upsertLocal(food);
    showToast(`Ajouté : ${f.name}, ${fmtDec(grams)} g (${mealLabel(m).toLowerCase()}).`, {
      label: 'Annuler',
      run: () => removeEntry(entry, true),
    });
  };

  const handleCode = async (code: string) => {
    setScanning(false);
    lookupCtrl.current?.abort();
    const ctrl = new AbortController();
    lookupCtrl.current = ctrl;
    setLookup({ code, status: 'loading' });
    const known = await foodByCode(code).catch(() => undefined);
    if (ctrl.signal.aborted) return;
    if (known) {
      setLookup(null);
      upsertLocal(known);
      setSelected(known);
      return;
    }
    try {
      const { food, missing } = await fetchProduct(code, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setLookup(null);
      if (missing.length) {
        setEditor({
          initial: { ...food, source: 'off', id: undefined },
          missing,
          note: 'Fiche incomplète sur Open Food Facts. Complète les valeurs manquantes : l’aliment sera enregistré chez toi.',
          thenAdd: true,
        });
      } else {
        open(food);
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const kind = e instanceof OffError ? e.kind : 'network';
      setLookup({ code, status: kind === 'notfound' ? 'notfound' : 'error', message: offErrorMessage(e) });
    }
  };

  const showSearch = q.length >= 1;
  const remoteItems = remote.status === 'done' ? remote.items.filter((r) => !local.some((l) => l.id === r.id)) : [];

  const quick = (x: Food) => log(x, defaultGrams(x), meal);
  const foodList = (items: Food[], cv = true) => (
    <ul class={`card card--flush list ${cv ? 'list--cv' : ''}`}>
      {items.map((f) => (
        <FoodRow key={f.id} food={f} onOpen={open} onQuickAdd={quick} />
      ))}
    </ul>
  );

  return (
    <>
      <Sheet title="Ajouter un aliment" full onClose={onClose} class="addfood">
        <div class="sheet__content">
          <div class="stack stack--tight">
            <Segmented
              legend="Repas"
              hideLegend
              value={meal}
              onChange={setMeal}
              options={MEALS.map((m) => ({ value: m.id, label: m.short }))}
            />
            <form class="searchbar" role="search" onSubmit={(e) => e.preventDefault()}>
              <label class="sr-only" for={searchId}>
                Rechercher un aliment
              </label>
              <div class="searchbar__field">
                <Icon name="search" size={20} />
                <input
                  id={searchId}
                  class="input searchbar__input"
                  type="search"
                  placeholder="Rechercher un aliment"
                  value={query}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellcheck={false}
                />
              </div>
              <button type="button" class="scan-btn" aria-label="Scanner un code-barres" onClick={() => setScanning(true)}>
                <Icon name="barcode" size={24} />
              </button>
            </form>
            <div class="action-tiles">
              <button type="button" class="action-tile" onClick={() => setQuickOpen(true)}>
                <Icon name="flash" size={20} />
                Ajout rapide
              </button>
              <button type="button" class="action-tile" onClick={() => setRecipe({})}>
                <Icon name="pot" size={20} />
                Recette
              </button>
              <button
                type="button"
                class="action-tile"
                onClick={() => setEditor({ initial: { name: query.trim() }, thenAdd: true })}
              >
                <Icon name="plus" size={20} stroke={2.4} />
                Aliment
              </button>
            </div>
          </div>

          {!online && (
            <p class="notice">
              <span>Hors ligne : la recherche se limite à tes aliments enregistrés.</span>
            </p>
          )}

          {!showSearch && foods && (
            <>
              {meals.length > 0 && (
                <section class="group" aria-labelledby="meals-h">
                  <h3 class="group-title" id="meals-h">
                    Repas types
                  </h3>
                  <ul class="card card--flush list">
                    {meals.map((m) => (
                      <SavedMealRow key={m.id} meal={m} onOpen={setTemplate} onQuickAdd={addMeal} />
                    ))}
                  </ul>
                </section>
              )}
              {recipes.length > 0 && (
                <section class="group" aria-labelledby="rcp-h">
                  <h3 class="group-title" id="rcp-h">
                    Mes recettes
                  </h3>
                  {foodList(recipes)}
                </section>
              )}
              {favorites.length > 0 && (
                <section class="group" aria-labelledby="fav-h">
                  <h3 class="group-title" id="fav-h">
                    Favoris
                  </h3>
                  {foodList(favorites)}
                </section>
              )}
              {recents.length > 0 && (
                <section class="group" aria-labelledby="rec-h">
                  <h3 class="group-title" id="rec-h">
                    Récents
                  </h3>
                  {foodList(recents)}
                </section>
              )}
              {favorites.length === 0 && recents.length === 0 && meals.length === 0 && recipes.length === 0 && (
                <div class="card empty">
                  <span class="empty__icon" aria-hidden="true">
                    <Icon name="search" size={22} />
                  </span>
                  <p class="empty__title">Aucun aliment récent</p>
                  <p class="empty__text">
                    Cherche un produit, scanne un code-barres ou crée ton propre aliment. Il apparaîtra ici pour un
                    ajout en un geste.
                  </p>
                </div>
              )}
            </>
          )}

          {showSearch && (
            <>
              {meals.length > 0 && (
                <section class="group" aria-labelledby="meals-h">
                  <h3 class="group-title" id="meals-h">
                    Repas types
                  </h3>
                  <ul class="card card--flush list">
                    {meals.map((m) => (
                      <SavedMealRow key={m.id} meal={m} onOpen={setTemplate} onQuickAdd={addMeal} />
                    ))}
                  </ul>
                </section>
              )}

              {local.length > 0 && (
                <section class="group" aria-labelledby="mine-h">
                  <h3 class="group-title" id="mine-h">
                    Mes aliments
                  </h3>
                  {foodList(local, false)}
                </section>
              )}
              <section class="group" aria-labelledby="off-h" aria-busy={remote.status === 'loading'}>
                <h3 class="group-title" id="off-h">
                  Open Food Facts
                </h3>
                {q.length < 2 && <p class="footnote">Tape au moins 2 lettres.</p>}
                {remote.status === 'loading' && (
                  <div class="card card--flush">
                    <SkeletonRows count={5} />
                  </div>
                )}
                {remote.status === 'error' && (
                  <div class="notice notice--error" role="alert">
                    <span>{remote.message}</span>
                    {!remote.autoRetry && (
                      <button type="button" class="btn btn--sm btn--secondary" onClick={() => setRetry((n) => n + 1)}>
                        Réessayer
                      </button>
                    )}
                  </div>
                )}
                {remote.status === 'done' && remote.items.length === 0 && (
                  <p class="footnote">Aucun résultat pour « {query.trim()} ».</p>
                )}
                {remoteItems.length > 0 && foodList(remoteItems)}
              </section>
            </>
          )}

          {showSearch && (
            <button
              type="button"
              class="btn btn--secondary btn--block"
              onClick={() => setEditor({ initial: { name: query.trim() }, thenAdd: true })}
            >
              <Icon name="plus" size={20} stroke={2.4} />
              Créer « {query.trim()} »
            </button>
          )}

          <p class="attribution">
            Données produits :{' '}
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
              Open Food Facts
            </a>{' '}
            (ODbL)
          </p>
        </div>
        <ToastHost />
      </Sheet>

      {selected && (
        <QuantitySheet
          food={selected}
          grams={defaultGrams(selected)}
          meal={meal}
          mode="add"
          onClose={() => setSelected(null)}
          onConfirm={(grams, m) => {
            log(selected, grams, m);
            setSelected(null);
            onClose();
          }}
          onToggleFavorite={(fav) => {
            const next = { ...selected, favorite: fav };
            saveFood(next);
            upsertLocal(next);
          }}
          onEditFood={
            selected.source === 'custom'
              ? () => {
                  if (selected.recipe) setRecipe({ initial: selected });
                  else setEditor({ initial: selected, thenAdd: true });
                  setSelected(null);
                }
              : undefined
          }
        />
      )}

      {editor && (
        <FoodEditor
          initial={editor.initial}
          missing={editor.missing}
          note={editor.note}
          onClose={() => setEditor(null)}
          onSave={(food) => {
            saveFood(food);
            upsertLocal(food);
            setEditor(null);
            if (editor.thenAdd) setSelected(food);
          }}
        />
      )}

      {quickOpen && (
        <QuickAddSheet
          meal={meal}
          mode="add"
          onClose={() => setQuickOpen(false)}
          onConfirm={(v, m) => {
            const entry = addQuickEntry(v, m, date);
            showToast(`Ajouté : ${entry.name}, ${v.kcal} kcal`, { label: 'Annuler', run: () => removeEntry(entry, true) });
            setQuickOpen(false);
            onClose();
          }}
        />
      )}

      {recipe && (
        <RecipeEditor
          initial={recipe.initial}
          onClose={() => setRecipe(null)}
          onSave={(food) => {
            saveFood(food);
            upsertLocal(food);
            setRecipe(null);
            setSelected(food);
          }}
        />
      )}

      {template && (
        <MealTemplateSheet
          meal={template}
          target={meal}
          date={date}
          onClose={() => setTemplate(null)}
          onAdded={() => {
            setTemplate(null);
            onClose();
          }}
        />
      )}

      {scanning && <Scanner onClose={() => setScanning(false)} onDetected={(c) => void handleCode(c)} />}

      {lookup && (
        <Sheet
          title={
            lookup.status === 'loading'
              ? 'Recherche du produit'
              : lookup.status === 'notfound'
                ? 'Produit introuvable'
                : 'Recherche impossible'
          }
          subtitle={`Code ${lookup.code}`}
          onClose={() => {
            lookupCtrl.current?.abort();
            setLookup(null);
          }}
        >
          {lookup.status === 'loading' ? (
            <div aria-busy="true">
              <SkeletonRows count={1} />
            </div>
          ) : (
            <div class="sheet__content">
              <p class="muted">
                {lookup.status === 'notfound'
                  ? "Ce code n'existe pas sur Open Food Facts. Crée l'aliment : il sera reconnu au prochain scan."
                  : lookup.message}
              </p>
              <div class="stack stack--tight">
                <button
                  type="button"
                  class="btn btn--primary btn--block"
                  onClick={() => {
                    const code = lookup.code;
                    setLookup(null);
                    setEditor({ initial: { code }, thenAdd: true });
                  }}
                >
                  Créer cet aliment
                </button>
                {lookup.status === 'error' && (
                  <button type="button" class="btn btn--secondary btn--block" onClick={() => void handleCode(lookup.code)}>
                    Réessayer
                  </button>
                )}
                <button
                  type="button"
                  class="btn btn--plain btn--block"
                  onClick={() => {
                    setLookup(null);
                    setScanning(true);
                  }}
                >
                  Scanner à nouveau
                </button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

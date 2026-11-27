import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { addEntry, removeEntry, saveFood } from '../../app/actions';
import { lazy } from '../../app/lazy';
import { showToast } from '../../app/store';
import { allFoods, foodByCode } from '../../lib/db';
import type { Food } from '../../lib/db/schema';
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
import { QuantitySheet } from './QuantitySheet';

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
  const recents = useMemo(
    () =>
      all
        .filter((f) => f.lastUsedAt && !f.favorite)
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

  return (
    <>
      <Sheet title="Ajouter un aliment" full onClose={onClose} class="addfood">
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
          <button
            type="button"
            class="icon-btn icon-btn--tint searchbar__scan"
            aria-label="Scanner un code-barres"
            onClick={() => setScanning(true)}
          >
            <Icon name="barcode" />
          </button>
        </form>

        {!online && <p class="notice">Hors ligne : la recherche se limite à tes aliments enregistrés.</p>}

        <button
          type="button"
          class="btn btn--ghost btn--block"
          onClick={() => setEditor({ initial: { name: query.trim() }, thenAdd: true })}
        >
          <Icon name="plus" size={20} />
          {query.trim() ? `Créer « ${query.trim()} »` : 'Créer un aliment'}
        </button>

        {!showSearch && foods && (
          <>
            {favorites.length > 0 && (
              <section aria-labelledby="fav-h">
                <h3 class="section-title" id="fav-h">
                  Favoris
                </h3>
                <ul class="list list--cv">
                  {favorites.map((f) => (
                    <FoodRow key={f.id} food={f} onOpen={open} onQuickAdd={(x) => log(x, defaultGrams(x), meal)} />
                  ))}
                </ul>
              </section>
            )}
            {recents.length > 0 && (
              <section aria-labelledby="rec-h">
                <h3 class="section-title" id="rec-h">
                  Récents
                </h3>
                <ul class="list list--cv">
                  {recents.map((f) => (
                    <FoodRow key={f.id} food={f} onOpen={open} onQuickAdd={(x) => log(x, defaultGrams(x), meal)} />
                  ))}
                </ul>
              </section>
            )}
            {favorites.length === 0 && recents.length === 0 && (
              <div class="empty">
                <p>Aucun aliment récent pour l'instant.</p>
                <p class="muted">Cherche un produit, scanne un code-barres ou crée ton propre aliment. Il apparaîtra ici.</p>
              </div>
            )}
          </>
        )}

        {showSearch && (
          <>
            {local.length > 0 && (
              <section aria-labelledby="mine-h">
                <h3 class="section-title" id="mine-h">
                  Mes aliments
                </h3>
                <ul class="list">
                  {local.map((f) => (
                    <FoodRow key={f.id} food={f} onOpen={open} onQuickAdd={(x) => log(x, defaultGrams(x), meal)} />
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="off-h" aria-busy={remote.status === 'loading'}>
              <h3 class="section-title" id="off-h">
                Open Food Facts
              </h3>
              {q.length < 2 && <p class="muted small">Tape au moins 2 lettres.</p>}
              {remote.status === 'loading' && <SkeletonRows count={5} />}
              {remote.status === 'error' && (
                <div class="notice notice--error" role="alert">
                  <p>{remote.message}</p>
                  {!remote.autoRetry && (
                    <button type="button" class="btn btn--small" onClick={() => setRetry((n) => n + 1)}>
                      Réessayer
                    </button>
                  )}
                </div>
              )}
              {remote.status === 'done' && remote.items.length === 0 && (
                <p class="muted small">Aucun résultat pour « {query.trim()} ».</p>
              )}
              {remoteItems.length > 0 && (
                <ul class="list list--cv">
                  {remoteItems.map((f) => (
                    <FoodRow key={f.id} food={f} onOpen={open} onQuickAdd={(x) => log(x, defaultGrams(x), meal)} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        <p class="attribution">
          Données produits :{' '}
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
            Open Food Facts
          </a>{' '}
          (ODbL)
        </p>
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
                  setEditor({ initial: selected, thenAdd: true });
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

      {scanning && <Scanner onClose={() => setScanning(false)} onDetected={(c) => void handleCode(c)} />}

      {lookup && (
        <Sheet
          title={lookup.status === 'loading' ? 'Recherche du produit' : lookup.status === 'notfound' ? 'Produit introuvable' : 'Recherche impossible'}
          onClose={() => {
            lookupCtrl.current?.abort();
            setLookup(null);
          }}
        >
          {lookup.status === 'loading' ? (
            <div aria-busy="true">
              <p class="muted small">Code {lookup.code}</p>
              <SkeletonRows count={1} />
            </div>
          ) : (
            <div class="stack">
              <p>
                {lookup.status === 'notfound'
                  ? `Le code ${lookup.code} n'existe pas sur Open Food Facts. Tu peux créer l'aliment, il sera reconnu au prochain scan.`
                  : lookup.message}
              </p>
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
                <button type="button" class="btn btn--ghost btn--block" onClick={() => void handleCode(lookup.code)}>
                  Réessayer
                </button>
              )}
              <button
                type="button"
                class="btn btn--ghost btn--block"
                onClick={() => {
                  setLookup(null);
                  setScanning(true);
                }}
              >
                Scanner à nouveau
              </button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

import { useRef, useState } from 'preact/hooks';
import { resetLoadedState, saveProfile } from '../../app/actions';
import { showToast, useStore } from '../../app/store';
import { getTheme, setTheme, type Theme } from '../../app/theme';
import { clearAll, dumpAll, replaceAll } from '../../lib/db';
import { BackupError, backupFileName, buildBackup, parseBackup, type ParsedBackup } from '../../lib/db/backup';
import { fmtDec, fmtInt, fmtKg, parseDecimal, toInputString } from '../../lib/format';
import { ACTIVITY_LEVELS, computeTargets, kcalFromMacros } from '../../lib/nutrition/targets';
import type { MacroTargets, Profile } from '../../lib/nutrition/types';
import { Field, Segmented } from '../../ui/controls';
import { Sheet } from '../../ui/Sheet';
import { ProfileForm } from './ProfileForm';

declare const __APP_VERSION__: string;

const GOAL_TEXT = { lose: 'Perte', maintain: 'Maintien', gain: 'Prise' } as const;

export default function SettingsScreen({ profile }: { profile: Profile }) {
  const today = useStore((s) => s.today);
  const persisted = useStore((s) => s.persisted);
  const [editProfile, setEditProfile] = useState(false);
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [pendingImport, setPendingImport] = useState<ParsedBackup | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const auto = computeTargets(profile, today);
  const activity = ACTIVITY_LEVELS.find((a) => a.id === profile.activity)?.label ?? '';

  const exportData = async () => {
    try {
      const json = JSON.stringify(buildBackup(await dumpAll(), getTheme()));
      const name = backupFileName();
      const file = new File([json], name, { type: 'application/json' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          return;
        } catch (e) {
          if ((e as DOMException).name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error(e);
      showToast("L'export a échoué. Réessaie.");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      setPendingImport(parsed);
    } catch (e) {
      showToast(e instanceof BackupError ? e.message : 'Fichier illisible : ce n’est pas une sauvegarde valide.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <header class="topbar">
        <h1 class="topbar__title">Réglages</h1>
      </header>
      <main class="screen" id="main">
        <section class="card" aria-labelledby="set-profile">
          <h2 class="card__title" id="set-profile">
            Profil
          </h2>
          <dl class="kv">
            <div>
              <dt>Sexe, âge</dt>
              <dd>
                {profile.sex === 'male' ? 'Homme' : 'Femme'}, {auto.age} ans
              </dd>
            </div>
            <div>
              <dt>Taille, poids</dt>
              <dd>
                {fmtInt(profile.heightCm)} cm, {fmtKg(profile.weightKg)} kg
              </dd>
            </div>
            <div>
              <dt>Activité</dt>
              <dd>{activity}</dd>
            </div>
            <div>
              <dt>Objectif</dt>
              <dd>
                {GOAL_TEXT[profile.goal]}
                {profile.goal !== 'maintain' && `, ${fmtDec(profile.rateKgPerWeek)} kg par semaine`}
              </dd>
            </div>
          </dl>
          <button type="button" class="btn btn--ghost btn--block" onClick={() => setEditProfile(true)}>
            Modifier mon profil
          </button>
        </section>

        <GoalsCard profile={profile} />

        <section class="card" aria-labelledby="set-theme">
          <h2 class="card__title" id="set-theme">
            Apparence
          </h2>
          <Segmented
            legend="Thème"
            value={theme}
            onChange={(t) => {
              setTheme(t);
              setThemeState(t);
            }}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Clair' },
              { value: 'dark', label: 'Sombre' },
            ]}
          />
        </section>

        <section class="card stack" aria-labelledby="set-data">
          <h2 class="card__title" id="set-data">
            Données
          </h2>
          <p class="muted small">
            Tout est stocké sur ce téléphone.{' '}
            {persisted === true
              ? 'Stockage persistant activé : le système ne l’effacera pas pour libérer de la place.'
              : persisted === false
                ? 'Installe l’app sur l’écran d’accueil pour que le stockage soit conservé durablement.'
                : ''}
          </p>
          <div class="row-actions">
            <button type="button" class="btn btn--ghost" onClick={() => void exportData()}>
              Exporter (JSON)
            </button>
            <button type="button" class="btn btn--ghost" onClick={() => fileRef.current?.click()}>
              Importer
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              class="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void onFile(e.currentTarget.files?.[0])}
            />
          </div>
          <button type="button" class="btn btn--danger-ghost btn--block" onClick={() => setConfirmWipe(true)}>
            Supprimer toutes les données
          </button>
        </section>

        <section class="card" aria-labelledby="set-about">
          <h2 class="card__title" id="set-about">
            À propos
          </h2>
          <p class="muted small">
            MyFit {__APP_VERSION__}. Aucun compte, aucune publicité, aucun suivi. Seules les recherches de produits
            partent vers{' '}
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
              Open Food Facts
            </a>{' '}
            (données sous licence ODbL).
          </p>
        </section>
      </main>

      {editProfile && (
        <Sheet title="Mon profil" onClose={() => setEditProfile(false)}>
          <ProfileForm
            initial={profile}
            submitLabel="Enregistrer"
            onSubmit={(p) => {
              saveProfile(p);
              setEditProfile(false);
              showToast('Profil mis à jour.');
            }}
          />
        </Sheet>
      )}

      {pendingImport && (
        <Sheet title="Importer cette sauvegarde ?" onClose={() => setPendingImport(null)}>
          <div class="stack">
            <p>
              Elle contient {pendingImport.backup.data.entries.length} aliments notés,{' '}
              {pendingImport.backup.data.weights.length} pesées et {pendingImport.backup.data.foods.length} aliments
              enregistrés. Les données actuelles seront remplacées.
            </p>
            {pendingImport.skipped > 0 && (
              <p class="muted small">{pendingImport.skipped} éléments illisibles seront ignorés.</p>
            )}
            <button
              type="button"
              class="btn btn--primary btn--block"
              onClick={async () => {
                const { backup } = pendingImport;
                setPendingImport(null);
                try {
                  await replaceAll(backup.data);
                  if (backup.theme === 'light' || backup.theme === 'dark' || backup.theme === 'auto') {
                    setTheme(backup.theme);
                    setThemeState(backup.theme);
                  }
                  await resetLoadedState();
                  showToast('Sauvegarde importée.');
                } catch (e) {
                  console.error(e);
                  showToast("L'import a échoué, tes données n'ont pas changé.");
                }
              }}
            >
              Remplacer mes données
            </button>
            <button type="button" class="btn btn--ghost btn--block" onClick={() => setPendingImport(null)}>
              Annuler
            </button>
          </div>
        </Sheet>
      )}

      {confirmWipe && (
        <Sheet title="Tout supprimer ?" onClose={() => setConfirmWipe(false)}>
          <div class="stack">
            <p>Journal, pesées, aliments et profil seront effacés de ce téléphone. Action définitive.</p>
            <button
              type="button"
              class="btn btn--danger btn--block"
              onClick={async () => {
                setConfirmWipe(false);
                try {
                  await clearAll();
                  setTheme('auto');
                  location.hash = '';
                  await resetLoadedState();
                } catch (e) {
                  console.error(e);
                  showToast('La suppression a échoué. Réessaie.');
                }
              }}
            >
              Tout supprimer
            </button>
            <button type="button" class="btn btn--ghost btn--block" onClick={() => setConfirmWipe(false)}>
              Annuler
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function GoalsCard({ profile }: { profile: Profile }) {
  const today = useStore((s) => s.today);
  const auto = computeTargets(profile, today);
  const [pText, setPText] = useState(toInputString(profile.proteinPerKg, 2));
  const [fText, setFText] = useState(toInputString(profile.fatPerKg, 2));
  const p = parseDecimal(pText);
  const f = parseDecimal(fText);
  const pErr = p == null || p < 0.5 || p > 3.5 ? 'Entre 0,5 et 3,5 g/kg.' : null;
  const fErr = f == null || f < 0.3 || f > 2 ? 'Entre 0,3 et 2 g/kg.' : null;

  const setRatio = (key: 'proteinPerKg' | 'fatPerKg', text: string, set: (v: string) => void, min: number, max: number) => {
    set(text);
    const v = parseDecimal(text);
    if (v != null && v >= min && v <= max) saveProfile({ ...profile, [key]: v });
  };

  return (
    <section class="card stack" aria-labelledby="set-goals">
      <h2 class="card__title" id="set-goals">
        Objectifs
      </h2>
      <dl class="kv">
        <div>
          <dt>Métabolisme de base</dt>
          <dd>{fmtInt(auto.bmr)} kcal</dd>
        </div>
        <div>
          <dt>Dépense estimée</dt>
          <dd>{fmtInt(auto.tdee)} kcal</dd>
        </div>
        {auto.adjustment !== 0 && (
          <div>
            <dt>{auto.adjustment < 0 ? 'Déficit' : 'Surplus'}</dt>
            <dd>{fmtInt(Math.abs(auto.adjustment))} kcal</dd>
          </div>
        )}
        <div>
          <dt>Cible calculée</dt>
          <dd>{fmtInt(auto.kcal)} kcal</dd>
        </div>
      </dl>
      {auto.clamped && (
        <p class="notice">Rythme trop rapide pour ton profil : la cible est relevée à un minimum raisonnable.</p>
      )}

      {profile.override ? (
        <OverrideEditor profile={profile} override={profile.override} />
      ) : (
        <>
          <div class="grid-2">
            <Field
              label="Protéines"
              value={pText}
              onValue={(v) => setRatio('proteinPerKg', v, setPText, 0.5, 3.5)}
              suffix="g/kg"
              decimal
              hint={`${fmtInt(auto.protein)} g par jour`}
              error={pErr}
            />
            <Field
              label="Lipides"
              value={fText}
              onValue={(v) => setRatio('fatPerKg', v, setFText, 0.3, 2)}
              suffix="g/kg"
              decimal
              hint={`${fmtInt(auto.fat)} g par jour`}
              error={fErr}
            />
          </div>
          <p class="muted small">Glucides : le reste des calories, soit {fmtInt(auto.carbs)} g par jour.</p>
          <button
            type="button"
            class="btn btn--ghost btn--block"
            onClick={() =>
              saveProfile({
                ...profile,
                override: { kcal: auto.kcal, protein: auto.protein, carbs: auto.carbs, fat: auto.fat },
              })
            }
          >
            Régler mes objectifs à la main
          </button>
        </>
      )}
    </section>
  );
}

function OverrideEditor({ profile, override }: { profile: Profile; override: MacroTargets }) {
  const [vals, setVals] = useState({
    kcal: String(override.kcal),
    protein: String(override.protein),
    carbs: String(override.carbs),
    fat: String(override.fat),
  });
  const limits = { kcal: [800, 6000], protein: [0, 500], carbs: [0, 1000], fat: [0, 400] } as const;
  const errs = Object.fromEntries(
    (Object.keys(vals) as (keyof typeof vals)[]).map((k) => {
      const v = parseDecimal(vals[k]);
      const [lo, hi] = limits[k];
      return [k, v == null || v < lo || v > hi ? `Entre ${lo} et ${hi}.` : null];
    }),
  ) as Record<keyof typeof vals, string | null>;

  const update = (k: keyof typeof vals) => (text: string) => {
    const next = { ...vals, [k]: text };
    setVals(next);
    const nums = {
      kcal: parseDecimal(next.kcal),
      protein: parseDecimal(next.protein),
      carbs: parseDecimal(next.carbs),
      fat: parseDecimal(next.fat),
    };
    const ok = (Object.keys(nums) as (keyof typeof nums)[]).every((key) => {
      const v = nums[key];
      return v != null && v >= limits[key][0] && v <= limits[key][1];
    });
    if (ok) {
      saveProfile({
        ...profile,
        override: {
          kcal: Math.round(nums.kcal!),
          protein: Math.round(nums.protein!),
          carbs: Math.round(nums.carbs!),
          fat: Math.round(nums.fat!),
        },
      });
    }
  };

  const fromMacros = kcalFromMacros(override);
  const gap = Math.abs(fromMacros - override.kcal);

  return (
    <>
      <p class="notice">Objectifs réglés à la main. Ils ne changent plus avec ton poids.</p>
      <div class="grid-2">
        <Field label="Calories" value={vals.kcal} onValue={update('kcal')} suffix="kcal" inputMode="numeric" error={errs.kcal} />
        <Field label="Protéines" value={vals.protein} onValue={update('protein')} suffix="g" inputMode="numeric" error={errs.protein} />
        <Field label="Glucides" value={vals.carbs} onValue={update('carbs')} suffix="g" inputMode="numeric" error={errs.carbs} />
        <Field label="Lipides" value={vals.fat} onValue={update('fat')} suffix="g" inputMode="numeric" error={errs.fat} />
      </div>
      <p class={`small ${gap > override.kcal * 0.05 ? 'warn-text' : 'muted'}`}>
        Les macros représentent {fmtInt(fromMacros)} kcal
        {gap > override.kcal * 0.05 ? `, soit ${fmtInt(gap)} kcal d'écart avec l'objectif.` : '.'}
      </p>
      <button type="button" class="btn btn--ghost btn--block" onClick={() => saveProfile({ ...profile, override: null })}>
        Revenir au calcul auto
      </button>
    </>
  );
}

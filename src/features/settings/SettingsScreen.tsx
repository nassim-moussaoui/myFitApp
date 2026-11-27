import { useRef, useState } from 'preact/hooks';
import { resetLoadedState, saveProfile } from '../../app/actions';
import { showToast, useStore } from '../../app/store';
import { getTheme, setTheme, type Theme } from '../../app/theme';
import { clearAll, dumpAll, replaceAll } from '../../lib/db';
import { BackupError, backupFileName, buildBackup, parseBackup, type ParsedBackup } from '../../lib/db/backup';
import { fmtDec, fmtInt, fmtKg, parseDecimal, toInputString } from '../../lib/format';
import { ACTIVITY_LEVELS, computeTargets, kcalFromMacros } from '../../lib/nutrition/targets';
import type { MacroTargets, Profile } from '../../lib/nutrition/types';
import { RowField, Segmented, Switch } from '../../ui/controls';
import { Icon, type IconName } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { ProfileForm } from './ProfileForm';

declare const __APP_VERSION__: string;

const GOAL_TEXT = { lose: 'Perte', maintain: 'Maintien', gain: 'Prise' } as const;

function ActionRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button type="button" class={`action-row ${danger ? 'action-row--danger' : ''}`} onClick={onClick}>
      <span class="action-row__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span class="action-row__label">{label}</span>
      {!danger && (
        <span class="row__chev" aria-hidden="true">
          <Icon name="chevron" size={18} />
        </span>
      )}
    </button>
  );
}

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
      setPendingImport(parseBackup(JSON.parse(await file.text())));
    } catch (e) {
      showToast(e instanceof BackupError ? e.message : 'Fichier illisible : ce n’est pas une sauvegarde valide.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <header class="page-header">
        <h1 class="page-title">Réglages</h1>
      </header>
      <main class="page" id="main">
        <section class="group" aria-labelledby="set-profile">
          <h2 class="group-title" id="set-profile">
            Profil
          </h2>
          <div class="card card--flush">
            <dl class="kv">
              <div>
                <dt>Sexe, âge</dt>
                <dd>
                  {profile.sex === 'male' ? 'Homme' : 'Femme'}, {auto.age} ans
                </dd>
              </div>
              <div>
                <dt>Taille</dt>
                <dd>{fmtInt(profile.heightCm)} cm</dd>
              </div>
              <div>
                <dt>Poids</dt>
                <dd>{fmtKg(profile.weightKg)} kg</dd>
              </div>
              <div>
                <dt>Activité</dt>
                <dd>{activity}</dd>
              </div>
              <div>
                <dt>Objectif</dt>
                <dd>
                  {GOAL_TEXT[profile.goal]}
                  {profile.goal !== 'maintain' && `, ${fmtDec(profile.rateKgPerWeek)} kg/sem.`}
                </dd>
              </div>
            </dl>
            <hr class="divider" />
            <ActionRow icon="user" label="Modifier mon profil" onClick={() => setEditProfile(true)} />
          </div>
        </section>

        <GoalsGroup profile={profile} />

        <section class="group" aria-labelledby="set-theme">
          <h2 class="group-title" id="set-theme">
            Apparence
          </h2>
          <div class="card">
            <Segmented
              legend="Thème"
              hideLegend
              value={theme}
              onChange={(t) => {
                setTheme(t);
                setThemeState(t);
              }}
              options={[
                { value: 'auto', label: 'Automatique' },
                { value: 'light', label: 'Clair' },
                { value: 'dark', label: 'Sombre' },
              ]}
            />
          </div>
        </section>

        <section class="group" aria-labelledby="set-data">
          <h2 class="group-title" id="set-data">
            Données
          </h2>
          <div class="card card--flush">
            <ActionRow icon="export" label="Exporter mes données" onClick={() => void exportData()} />
            <ActionRow icon="import" label="Importer une sauvegarde" onClick={() => fileRef.current?.click()} />
            <ActionRow icon="trash" label="Supprimer toutes les données" danger onClick={() => setConfirmWipe(true)} />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            class="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void onFile(e.currentTarget.files?.[0])}
          />
          <p class="footnote" style={{ padding: '0 0.25rem' }}>
            Tout est stocké sur ce téléphone.{' '}
            {persisted === true
              ? 'Stockage persistant activé : le système ne l’effacera pas pour libérer de la place.'
              : persisted === false
                ? 'Installe l’app sur l’écran d’accueil pour que le stockage soit conservé durablement.'
                : ''}
          </p>
        </section>

        <section class="group" aria-labelledby="set-about">
          <h2 class="group-title" id="set-about">
            À propos
          </h2>
          <div class="card">
            <p class="footnote">
              MyFit {__APP_VERSION__}. Aucun compte, aucune publicité, aucun suivi. Seules les recherches de produits
              partent vers{' '}
              <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
                Open Food Facts
              </a>{' '}
              (données sous licence ODbL).
            </p>
          </div>
        </section>
      </main>

      {editProfile && (
        <Sheet title="Mon profil" full onClose={() => setEditProfile(false)}>
          <ProfileForm
            initial={profile}
            submitLabel="Enregistrer"
            onSubmit={(p) => {
              saveProfile(p);
              setEditProfile(false);
              showToast('Profil mis à jour');
            }}
          />
        </Sheet>
      )}

      {pendingImport && (
        <Sheet title="Importer cette sauvegarde ?" onClose={() => setPendingImport(null)}>
          <div class="sheet__content">
            <div class="tiles">
              <div class="tile">
                <span class="tile__label">Aliments notés</span>
                <span class="tile__value">{pendingImport.backup.data.entries.length}</span>
              </div>
              <div class="tile">
                <span class="tile__label">Pesées</span>
                <span class="tile__value">{pendingImport.backup.data.weights.length}</span>
              </div>
              <div class="tile">
                <span class="tile__label">Mes aliments</span>
                <span class="tile__value">{pendingImport.backup.data.foods.length}</span>
              </div>
            </div>
            <p class="muted">Les données actuelles de ce téléphone seront remplacées.</p>
            {pendingImport.skipped > 0 && (
              <p class="footnote">{pendingImport.skipped} éléments illisibles seront ignorés.</p>
            )}
            <div class="stack stack--tight">
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
                    showToast('Sauvegarde importée');
                  } catch (e) {
                    console.error(e);
                    showToast("L'import a échoué, tes données n'ont pas changé.");
                  }
                }}
              >
                Remplacer mes données
              </button>
              <button type="button" class="btn btn--plain btn--block" onClick={() => setPendingImport(null)}>
                Annuler
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {confirmWipe && (
        <Sheet title="Tout supprimer ?" onClose={() => setConfirmWipe(false)}>
          <div class="sheet__content">
            <p class="muted">Journal, pesées, aliments et profil seront effacés de ce téléphone. Action définitive.</p>
            <div class="stack stack--tight">
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
              <button type="button" class="btn btn--plain btn--block" onClick={() => setConfirmWipe(false)}>
                Annuler
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

function GoalsGroup({ profile }: { profile: Profile }) {
  const today = useStore((s) => s.today);
  const auto = computeTargets(profile, today);
  const [pText, setPText] = useState(toInputString(profile.proteinPerKg, 2));
  const [fText, setFText] = useState(toInputString(profile.fatPerKg, 2));
  const p = parseDecimal(pText);
  const f = parseDecimal(fText);
  const pErr = p == null || p < 0.5 || p > 3.5 ? 'Entre 0,5 et 3,5' : null;
  const fErr = f == null || f < 0.3 || f > 2 ? 'Entre 0,3 et 2' : null;

  const setRatio = (key: 'proteinPerKg' | 'fatPerKg', text: string, set: (v: string) => void, min: number, max: number) => {
    set(text);
    const v = parseDecimal(text);
    if (v != null && v >= min && v <= max) saveProfile({ ...profile, [key]: v });
  };

  return (
    <section class="group" aria-labelledby="set-goals">
      <h2 class="group-title" id="set-goals">
        Objectifs
      </h2>
      <div class="card card--flush">
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
            <dd>
              <strong style={{ color: 'var(--text)' }}>{fmtInt(auto.kcal)} kcal</strong>
            </dd>
          </div>
        </dl>
        <hr class="divider" />
        <Switch
          label="Objectifs manuels"
          hint={profile.override ? 'Ne suivent plus ton poids' : 'Calculés depuis ton profil'}
          checked={!!profile.override}
          onChange={(on) =>
            saveProfile({
              ...profile,
              override: on ? { kcal: auto.kcal, protein: auto.protein, carbs: auto.carbs, fat: auto.fat } : null,
            })
          }
        />
        <hr class="divider" />
        {profile.override ? (
          <OverrideEditor key="manual" profile={profile} override={profile.override} />
        ) : (
          <>
            <RowField
              label="Protéines"
              hint={`${fmtInt(auto.protein)} g par jour`}
              value={pText}
              onValue={(v) => setRatio('proteinPerKg', v, setPText, 0.5, 3.5)}
              suffix="g/kg"
              error={pErr}
            />
            <RowField
              label="Lipides"
              hint={`${fmtInt(auto.fat)} g par jour`}
              value={fText}
              onValue={(v) => setRatio('fatPerKg', v, setFText, 0.3, 2)}
              suffix="g/kg"
              error={fErr}
            />
            <div class="kv-row" style={{ borderTop: '1px solid var(--sep)' }}>
              <span>Glucides</span>
              <span class="muted num">{fmtInt(auto.carbs)} g, le reste</span>
            </div>
          </>
        )}
      </div>
      {auto.clamped && !profile.override && (
        <p class="footnote" style={{ padding: '0 0.25rem' }}>
          Rythme trop rapide pour ton profil : la cible est relevée à un minimum sûr.
        </p>
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
      return [k, v == null || v < lo || v > hi ? `Entre ${lo} et ${hi}` : null];
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
  const off = gap > override.kcal * 0.05;

  return (
    <>
      <RowField label="Calories" value={vals.kcal} onValue={update('kcal')} suffix="kcal" decimal={false} error={errs.kcal} />
      <RowField label="Protéines" value={vals.protein} onValue={update('protein')} suffix="g" decimal={false} error={errs.protein} />
      <RowField label="Glucides" value={vals.carbs} onValue={update('carbs')} suffix="g" decimal={false} error={errs.carbs} />
      <RowField label="Lipides" value={vals.fat} onValue={update('fat')} suffix="g" decimal={false} error={errs.fat} />
      <p class={`footnote ${off ? 'warn-text' : ''}`} style={{ padding: '0.75rem 0', borderTop: '1px solid var(--sep)' }}>
        Les macros représentent {fmtInt(fromMacros)} kcal
        {off ? `, soit ${fmtInt(gap)} kcal d'écart avec l'objectif.` : '.'}
      </p>
      <button
        type="button"
        class="btn btn--secondary btn--block"
        style={{ marginBottom: '1rem' }}
        onClick={() => saveProfile({ ...profile, override: null })}
      >
        Revenir au calcul auto
      </button>
    </>
  );
}

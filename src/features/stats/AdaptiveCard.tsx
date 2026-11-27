import { useEffect } from 'preact/hooks';
import { refreshAdaptive, setAdaptive } from '../../app/adaptive';
import { useStore } from '../../app/store';
import { fmtInt, fmtSigned } from '../../lib/format';
import { CONFIDENCE_LABEL, MIN_LOGGED_DAYS, MIN_WEIGH_INS } from '../../lib/nutrition/adaptive';
import { computeTargets } from '../../lib/nutrition/targets';
import type { Profile } from '../../lib/nutrition/types';
import { Switch } from '../../ui/controls';

/** Real expenditure measured from logged meals and weigh-ins, with the adaptive switch. */
export function AdaptiveCard({ profile }: { profile: Profile }) {
  const r = useStore((s) => s.adaptive);
  const today = useStore((s) => s.today);
  useEffect(() => {
    void refreshAdaptive();
  }, []);
  const t = computeTargets(profile, today);

  return (
    <section class="card" aria-labelledby="ad-h">
      <div class="card__head">
        <h2 class="card__title" id="ad-h">
          Dépense réelle
        </h2>
        {r?.ok && (
          <span class={`pill ${r.estimate.confidence === 'high' ? 'pill--accent' : ''}`}>
            {CONFIDENCE_LABEL[r.estimate.confidence]}
          </span>
        )}
      </div>
      {!r ? (
        <div class="skeleton skeleton--line" style={{ height: '3rem', width: '100%' }} aria-hidden="true" />
      ) : r.ok ? (
        <>
          <p class="hero-num">
            <span class="hero-num__value">{fmtInt(r.estimate.tdee)}</span>{' '}
            <span class="hero-num__unit">kcal par jour</span>
          </p>
          <p class="muted">
            Sur 4 semaines : {fmtInt(r.estimate.avgIntake)} kcal mangées en moyenne ({r.estimate.loggedDays} jours
            notés) et un poids qui évolue de {fmtSigned(r.estimate.weeklyChange)} kg par semaine ({r.estimate.weighIns}{' '}
            pesées). La formule donnait {fmtInt(r.estimate.formula)} kcal.
          </p>
        </>
      ) : (
        <>
          <p class="muted">{r.reason}</p>
          <div class="tiles" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div class="tile">
              <span class="tile__label">Jours notés</span>
              <span class="tile__value">
                {Math.min(r.loggedDays, MIN_LOGGED_DAYS)} <small>/ {MIN_LOGGED_DAYS}</small>
              </span>
            </div>
            <div class="tile">
              <span class="tile__label">Pesées</span>
              <span class="tile__value">
                {Math.min(r.weighIns, MIN_WEIGH_INS)} <small>/ {MIN_WEIGH_INS}</small>
              </span>
            </div>
          </div>
        </>
      )}
      <hr class="divider" />
      <Switch
        label="Ajuster mes objectifs automatiquement"
        hint={
          profile.adaptive
            ? t.adaptive
              ? `Objectifs calculés sur ${fmtInt(t.tdee)} kcal, mis à jour chaque semaine`
              : "Activé : s'appliquera dès qu'il y aura assez de données"
            : `Objectifs calculés avec la formule (${fmtInt(t.formulaTdee)} kcal)`
        }
        checked={!!profile.adaptive}
        onChange={setAdaptive}
      />
    </section>
  );
}

import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  addPhoto,
  ensureMeasurements,
  ensurePhotos,
  removeMeasurement,
  removePhoto,
  saveMeasurement,
} from '../../app/extras';
import { showToast, useStore } from '../../app/store';
import { MEASURES, type MeasureKey, type Measurement, type Photo } from '../../lib/db/schema';
import { isValidISODate, longDayLabel, relativeDayLabel, shortDayLabel, type ISODate } from '../../lib/date';
import { fmtKg, fmtSigned, parseDecimal, toInputString } from '../../lib/format';
import { Field } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';

export const MEASURE_LABEL: Record<MeasureKey, string> = {
  waist: 'Tour de taille',
  hips: 'Hanches',
  chest: 'Poitrine',
  arm: 'Bras',
  thigh: 'Cuisse',
  neck: 'Cou',
};

// ---------------------------------------------------------------- Measurements

function MeasureForm({
  initial,
  last,
  fixedDate,
  submitLabel,
  onSave,
  children,
}: {
  initial?: Measurement;
  last?: Measurement;
  fixedDate?: ISODate;
  submitLabel: string;
  onSave: (m: Measurement) => void;
  children?: preact.ComponentChildren;
}) {
  const today = useStore((s) => s.today);
  const [date, setDate] = useState(fixedDate ?? today);
  const [vals, setVals] = useState<Record<MeasureKey, string>>(
    Object.fromEntries(MEASURES.map((k) => [k, toInputString(initial?.[k])])) as Record<MeasureKey, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const parsed = MEASURES.map((k) => [k, vals[k].trim() === '' ? null : parseDecimal(vals[k])] as const);
  const bad = parsed.find(([, v]) => v != null && (v < 10 || v > 250));

  return (
    <form
      class="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (bad) return setError(`${MEASURE_LABEL[bad[0]]} : entre 10 et 250 cm.`);
        if (parsed.some(([k, v]) => vals[k].trim() !== '' && v == null)) return setError('Une valeur est invalide.');
        if (!parsed.some(([, v]) => v != null)) return setError('Renseigne au moins une mesure.');
        if (!isValidISODate(date) || date > today) return setError('Date invalide.');
        const m: Measurement = { date, createdAt: Date.now() };
        for (const [k, v] of parsed) if (v != null) m[k] = Math.round(v * 10) / 10;
        onSave(m);
      }}
    >
      {!fixedDate && <Field label="Date" type="date" value={date} onValue={setDate} max={today} />}
      <div class="grid-2">
        {MEASURES.map((k) => (
          <Field
            key={k}
            label={MEASURE_LABEL[k]}
            value={vals[k]}
            onValue={(v) => {
              setVals((s) => ({ ...s, [k]: v }));
              setError(null);
            }}
            suffix="cm"
            decimal
            placeholder={last?.[k] != null ? toInputString(last[k]) : undefined}
          />
        ))}
      </div>
      {error && (
        <p class="field__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" class="btn btn--primary btn--block">
        {submitLabel}
      </button>
      {children}
    </form>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 72;
  const h = 24;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const d = values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`)
    .join('');
  return (
    <svg class="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function MeasurementsView() {
  const list = useStore((s) => s.measurements);
  const today = useStore((s) => s.today);
  const [editing, setEditing] = useState<Measurement | null>(null);
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    void ensureMeasurements();
  }, []);
  const data = list ?? [];
  const last = data[data.length - 1];

  const series = useMemo(
    () =>
      MEASURES.map((k) => {
        const pts = data.filter((m) => m[k] != null).map((m) => ({ date: m.date, v: m[k]! }));
        return { k, pts };
      }).filter((s) => s.pts.length > 0),
    [data],
  );

  return (
    <>
      <section class="card" aria-labelledby="ms-new">
        <h2 class="card__title" id="ms-new">
          Nouvelles mesures
        </h2>
        <MeasureForm
          key={formKey}
          last={last}
          submitLabel="Enregistrer"
          onSave={(m) => {
            const existing = data.find((x) => x.date === m.date);
            saveMeasurement(existing ? { ...existing, ...m } : m);
            showToast('Mesures enregistrées');
            setFormKey((n) => n + 1);
          }}
        />
        <p class="footnote">Mesure le matin, ruban à plat, sans serrer. Une fois par semaine suffit.</p>
      </section>

      {series.length > 0 ? (
        <section class="card" aria-labelledby="ms-evo" style={{ gap: '0.25rem', paddingBottom: '0.25rem' }}>
          <h2 class="card__title" id="ms-evo">
            Évolution
          </h2>
          <ul class="list">
            {series.map(({ k, pts }) => {
              const lastV = pts[pts.length - 1]!.v;
              const delta = lastV - pts[0]!.v;
              return (
                <li class="row" key={k}>
                  <span class="row__main">
                    <span class="row__title">{MEASURE_LABEL[k]}</span>
                    <span class="row__sub">
                      {pts.length > 1 ? `${fmtSigned(delta)} cm depuis le ${shortDayLabel(pts[0]!.date)}` : 'Première mesure'}
                    </span>
                  </span>
                  <Sparkline values={pts.map((p) => p.v)} />
                  <span class="row__value">{fmtKg(lastV)} cm</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        list && (
          <div class="card empty">
            <span class="empty__icon" aria-hidden="true">
              <Icon name="ruler" size={22} />
            </span>
            <p class="empty__title">Aucune mesure pour l'instant</p>
            <p class="empty__text">Le tour de taille bouge souvent avant la balance : c'est un bon indicateur de progrès.</p>
          </div>
        )
      )}

      {data.length > 0 && (
        <section class="card" aria-labelledby="ms-hist" style={{ gap: '0.25rem', paddingBottom: '0.25rem' }}>
          <h2 class="card__title" id="ms-hist">
            Historique
          </h2>
          <ul class="list list--cv">
            {[...data].reverse().map((m) => (
              <li key={m.date}>
                <button type="button" class="row" onClick={() => setEditing(m)}>
                  <span class="row__main">
                    <span class="row__title">{relativeDayLabel(m.date, today)}</span>
                    <span class="row__sub">
                      {MEASURES.filter((k) => m[k] != null)
                        .map((k) => `${MEASURE_LABEL[k]} ${toInputString(m[k])}`)
                        .join(' · ')}
                    </span>
                  </span>
                  <span class="row__chev" aria-hidden="true">
                    <Icon name="chevron" size={18} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <Sheet title="Modifier les mesures" subtitle={longDayLabel(editing.date)} onClose={() => setEditing(null)}>
          <MeasureForm
            initial={editing}
            fixedDate={editing.date}
            submitLabel="Enregistrer"
            onSave={(m) => {
              saveMeasurement(m);
              setEditing(null);
            }}
          >
            <button
              type="button"
              class="btn btn--danger-soft btn--block"
              onClick={() => {
                removeMeasurement(editing);
                setEditing(null);
                showToast('Mesures supprimées');
              }}
            >
              <Icon name="trash" size={20} />
              Supprimer ces mesures
            </button>
          </MeasureForm>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Photos

function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

function PhotoImg({ photo, class: cls, alt }: { photo: Photo; class?: string; alt: string }) {
  const url = useObjectUrl(photo.blob);
  return <img class={cls} src={url} alt={alt} width={photo.width} height={photo.height} decoding="async" />;
}

export function PhotosView() {
  const photos = useStore((s) => s.photos);
  const weights = useStore((s) => s.weights);
  const today = useStore((s) => s.today);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  useEffect(() => {
    void ensurePhotos();
  }, []);
  const list = photos ?? [];
  const first = list[0];
  const latest = list[list.length - 1];

  const weightOn = (d: ISODate) => {
    const before = (weights ?? []).filter((w) => w.date <= d);
    return before[before.length - 1];
  };

  return (
    <>
      <section class="card" aria-labelledby="ph-new">
        <h2 class="card__title" id="ph-new">
          Photo de progression
        </h2>
        <Field label="Date de la photo" type="date" value={date} onValue={setDate} max={today} />
        <label class={`btn btn--primary btn--block file-btn ${busy ? 'is-busy' : ''}`}>
          <Icon name="camera" size={20} />
          {busy ? 'Enregistrement…' : 'Prendre ou choisir une photo'}
          <input
            type="file"
            accept="image/*"
            class="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              input.value = '';
              if (!file) return;
              setBusy(true);
              const ok = await addPhoto(file, isValidISODate(date) && date <= today ? date : today);
              setBusy(false);
              if (ok) showToast('Photo ajoutée');
            }}
          />
        </label>
        <p class="footnote">
          Les photos restent uniquement sur ce téléphone et ne sont pas incluses dans l'export. Même lumière, même
          tenue, même angle : la comparaison sera parlante.
        </p>
      </section>

      {first && latest && first.id !== latest.id && (
        <section class="card" aria-labelledby="ph-cmp">
          <h2 class="card__title" id="ph-cmp">
            Avant, maintenant
          </h2>
          <div class="compare">
            {[first, latest].map((p) => {
              const w = weightOn(p.date);
              return (
                <figure class="compare__item" key={p.id}>
                  <button type="button" class="photo-btn" onClick={() => setViewing(p)} aria-label={`Voir la photo du ${longDayLabel(p.date)}`}>
                    <PhotoImg photo={p} class="compare__img" alt="" />
                  </button>
                  <figcaption>
                    <strong>{shortDayLabel(p.date)}</strong>
                    {w && <span>{fmtKg(w.kg)} kg</span>}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {list.length > 0 ? (
        <section class="card" aria-labelledby="ph-all">
          <div class="card__head">
            <h2 class="card__title" id="ph-all">
              Toutes les photos
            </h2>
            <span class="card__sub">{list.length}</span>
          </div>
          <ul class="photo-grid">
            {[...list].reverse().map((p) => (
              <li key={p.id}>
                <button type="button" class="photo-btn" onClick={() => setViewing(p)}>
                  <PhotoImg photo={p} class="photo-grid__img" alt="" />
                  <span class="photo-grid__date">
                    <span class="sr-only">Photo du </span>
                    {shortDayLabel(p.date)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        photos && (
          <div class="card empty">
            <span class="empty__icon" aria-hidden="true">
              <Icon name="camera" size={22} />
            </span>
            <p class="empty__title">Aucune photo pour l'instant</p>
            <p class="empty__text">Une photo toutes les 2 à 4 semaines montre des changements que la balance ne voit pas.</p>
          </div>
        )
      )}

      {viewing && (
        <Sheet title="Photo" subtitle={longDayLabel(viewing.date)} full onClose={() => setViewing(null)}>
          <div class="sheet__content">
            <PhotoImg photo={viewing} class="photo-full" alt={`Photo de progression du ${longDayLabel(viewing.date)}`} />
            {weightOn(viewing.date) && (
              <p class="muted">Dernière pesée à cette date : {fmtKg(weightOn(viewing.date)!.kg)} kg</p>
            )}
            <button
              type="button"
              class="btn btn--danger-soft btn--block"
              onClick={() => {
                removePhoto(viewing);
                setViewing(null);
                showToast('Photo supprimée');
              }}
            >
              <Icon name="trash" size={20} />
              Supprimer la photo
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

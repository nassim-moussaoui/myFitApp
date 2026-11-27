import { useState } from 'preact/hooks';
import type { Food } from '../../lib/db/schema';
import { fmtDec, fmtInt } from '../../lib/format';
import { Icon } from '../../ui/Icon';

/** 44 px thumbnail with reserved space (no layout shift); a leaf icon when there is no image. */
export function Thumb({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span class="thumb">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name="leaf" size={20} />
      )}
    </span>
  );
}

export const defaultGrams = (f: Food) => f.lastGrams ?? f.servingGrams ?? 100;

export function FoodRow({
  food,
  onOpen,
  onQuickAdd,
}: {
  food: Food;
  onOpen: (f: Food) => void;
  onQuickAdd: (f: Food) => void;
}) {
  const [done, setDone] = useState(false);
  const g = defaultGrams(food);
  return (
    <li class="food-row">
      <button type="button" class="row" onClick={() => onOpen(food)}>
        <Thumb url={food.imageUrl} />
        <span class="row__main">
          <span class="row__title">{food.name}</span>
          <span class="row__sub">
            {food.brand ? `${food.brand} · ` : ''}
            {food.stub
              ? food.per100.kcal > 0
                ? `≈ ${fmtInt(food.per100.kcal)} kcal / 100 g`
                : 'Valeurs au toucher'
              : `${fmtInt(food.per100.kcal)} kcal / 100 g`}
          </span>
        </span>
      </button>
      <button
        type="button"
        class={`icon-btn icon-btn--tint quick-add ${done ? 'quick-add--done' : ''}`}
        aria-label={`Ajouter ${fmtDec(g)} g de ${food.name}`}
        onClick={() => {
          onQuickAdd(food);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }}
      >
        <Icon name={done ? 'check' : 'plus'} size={20} stroke={2.6} />
      </button>
    </li>
  );
}

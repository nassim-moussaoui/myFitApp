import { useEffect, useState } from 'preact/hooks';
import { removeEntry, saveFood, updateEntry } from '../../app/actions';
import { getFood } from '../../lib/db';
import type { Entry, Food } from '../../lib/db/schema';
import { QuantitySheet } from './QuantitySheet';

/** Edit or delete a journal entry. */
export default function EntrySheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [food, setFood] = useState<Food | null>(null);
  useEffect(() => {
    let alive = true;
    void getFood(entry.foodId)
      .catch(() => undefined)
      .then((f) => {
        if (alive) setFood(f ?? null);
      });
    return () => {
      alive = false;
    };
  }, [entry.foodId]);

  // The entry keeps its own snapshot of values; the stored food only adds favourite and portion.
  const view: Food = {
    id: entry.foodId,
    source: food?.source ?? 'custom',
    name: entry.name,
    brand: entry.brand,
    per100: entry.per100,
    servingGrams: food?.servingGrams,
    imageUrl: food?.imageUrl,
    favorite: food?.favorite,
    createdAt: 0,
    updatedAt: 0,
  };

  return (
    <QuantitySheet
      food={view}
      grams={entry.grams}
      meal={entry.meal}
      mode="edit"
      onClose={onClose}
      onConfirm={(grams, meal) => {
        updateEntry(entry, { grams, meal });
        onClose();
      }}
      onDelete={() => {
        removeEntry(entry);
        onClose();
      }}
      onToggleFavorite={
        food
          ? (fav) => {
              const next = { ...food, favorite: fav };
              setFood(next);
              saveFood(next);
            }
          : undefined
      }
    />
  );
}

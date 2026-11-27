import { getCachedSearch, putCachedSearch } from '../db';
import type { Food } from '../db/schema';
import { OffError, searchProducts } from './api';
import { RateLimiter } from './rateLimit';

/** Open Food Facts allows about 10 search requests per minute. */
export const searchLimiter = new RateLimiter(10, 60_000);

const memory = new Map<string, Food[]>();

export const normalizeQuery = (q: string) =>
  q.trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');

export interface SearchResult {
  items: Food[];
  fromCache: boolean;
}

/** Memory cache, then IndexedDB cache, then network (rate limited). */
export async function searchOff(q: string, signal?: AbortSignal): Promise<SearchResult> {
  const key = normalizeQuery(q);
  const mem = memory.get(key);
  if (mem) return { items: mem, fromCache: true };
  const cached = await getCachedSearch(key).catch(() => undefined);
  if (cached) {
    memory.set(key, cached.items);
    return { items: cached.items, fromCache: true };
  }
  if (signal?.aborted) throw new OffError('aborted');
  const wait = searchLimiter.waitTime();
  if (wait > 0) throw new OffError('rate', wait);
  searchLimiter.take();
  try {
    const items = await searchProducts(key, signal);
    memory.set(key, items);
    void putCachedSearch({ q: key, ts: Date.now(), items }).catch(() => {});
    return { items, fromCache: false };
  } catch (e) {
    if (e instanceof OffError && e.kind === 'rate') searchLimiter.block(e.retryInMs);
    throw e;
  }
}

/** Human message for an error, in French. */
export function offErrorMessage(e: unknown): string {
  const kind = e instanceof OffError ? e.kind : 'network';
  switch (kind) {
    case 'offline':
      return 'Hors ligne. Tes aliments enregistrés restent disponibles.';
    case 'rate': {
      const s = Math.ceil((e as OffError).retryInMs / 1000);
      return s > 0
        ? `Trop de recherches d'affilée. Nouvel essai possible dans ${s} s.`
        : "Trop de recherches d'affilée. Réessaie dans un instant.";
    }
    case 'timeout':
      return 'Open Food Facts met trop de temps à répondre.';
    case 'server':
      return 'Open Food Facts ne répond pas correctement pour le moment.';
    case 'notfound':
      return 'Produit introuvable.';
    default:
      return 'Connexion impossible à Open Food Facts.';
  }
}

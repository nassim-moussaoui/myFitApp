import { getCachedSearch, putCachedSearch } from '../db';
import type { Food } from '../db/schema';
import { OffError, fetchProduct, searchProducts, type MappedProduct } from './api';
import { RateLimiter } from './rateLimit';

/** Keeps the search service comfortable: at most 20 searches per minute. */
export const searchLimiter = new RateLimiter(20, 60_000);

const memory = new Map<string, Food[]>();

export const normalizeQuery = (q: string) =>
  q.trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');

export interface SearchResult {
  items: Food[];
  fromCache: boolean;
}

/** Memory cache, then IndexedDB cache, then network (rate limited). */
export async function searchOff(q: string, signal?: AbortSignal): Promise<SearchResult> {
  const query = normalizeQuery(q);
  // Versioned key: results from the former search endpoint are not reused.
  const key = `v2:${query}`;
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
    const items = await searchProducts(query, signal);
    memory.set(key, items);
    void putCachedSearch({ q: key, ts: Date.now(), items }).catch(() => {});
    return { items, fromCache: false };
  } catch (e) {
    if (e instanceof OffError && e.kind === 'rate') searchLimiter.block(e.retryInMs);
    throw e;
  }
}

const details = new Map<string, Promise<MappedProduct>>();

/**
 * Full product values for a search result (search hits only carry approximate values).
 * Cached for the session; a failed request is forgotten so it can be retried.
 */
export function resolveProduct(code: string, signal?: AbortSignal): Promise<MappedProduct> {
  let p = details.get(code);
  if (!p) {
    p = fetchProduct(code, signal);
    details.set(code, p);
    p.catch(() => details.delete(code));
  }
  return p;
}

/** Fetches the exact values of the first results in the background, two at a time. */
export async function prefetchDetails(codes: string[], onResolved: (m: MappedProduct) => void, signal?: AbortSignal) {
  const queue = [...codes];
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const code = queue.shift()!;
      try {
        onResolved(await resolveProduct(code));
      } catch {
        /* shown on tap if it fails again */
      }
    }
  };
  await Promise.all([worker(), worker()]);
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
      return typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'Hors ligne. Tes aliments enregistrés restent disponibles.'
        : 'Open Food Facts ne répond pas pour le moment. Réessaie dans un instant, ou crée l’aliment toi-même.';
  }
}

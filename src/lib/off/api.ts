import type { Food } from '../db/schema';
import type { Nutrients } from '../nutrition/types';

export const OFF_BASE = 'https://world.openfoodfacts.org';
const FIELDS =
  'code,product_name,product_name_fr,brands,nutriments,serving_size,serving_quantity,image_front_small_url';
const TIMEOUT_MS = 12_000;

export type OffErrorKind = 'offline' | 'rate' | 'network' | 'server' | 'notfound' | 'timeout' | 'aborted';

export class OffError extends Error {
  constructor(
    public kind: OffErrorKind,
    /** For "rate": milliseconds before a new attempt is allowed. */
    public retryInMs = 0,
  ) {
    super(kind);
  }
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
  serving_size?: string;
  serving_quantity?: number | string;
  image_front_small_url?: string;
}

export type CoreNutrient = 'kcal' | 'protein' | 'carbs' | 'fat';

export interface MappedProduct {
  food: Food;
  /** Core values absent from Open Food Facts (set to 0 in `food.per100`). */
  missing: CoreNutrient[];
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function mapProduct(p: OffProduct, now = Date.now()): MappedProduct | null {
  const code = p.code?.trim();
  if (!code) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj != null) kcal = kj / 4.184;
  }
  const core: Record<CoreNutrient, number | undefined> = {
    kcal,
    protein: num(n['proteins_100g']),
    carbs: num(n['carbohydrates_100g']),
    fat: num(n['fat_100g']),
  };
  const missing = (Object.keys(core) as CoreNutrient[]).filter((k) => core[k] == null);
  const per100: Nutrients = {
    kcal: round(core.kcal ?? 0, 0),
    protein: round(core.protein ?? 0),
    carbs: round(core.carbs ?? 0),
    fat: round(core.fat ?? 0),
  };
  const sugars = num(n['sugars_100g']);
  const fiber = num(n['fiber_100g']);
  const salt = num(n['salt_100g']);
  if (sugars != null) per100.sugars = round(sugars);
  if (fiber != null) per100.fiber = round(fiber);
  if (salt != null) per100.salt = round(salt, 2);

  const name = (p.product_name_fr || p.product_name || '').trim();
  const brand = p.brands?.split(',')[0]?.trim() || undefined;
  const servingGrams = num(p.serving_quantity);
  const food: Food = {
    id: `off:${code}`,
    source: 'off',
    code,
    name: name || 'Produit sans nom',
    brand,
    per100,
    createdAt: now,
    updatedAt: now,
  };
  if (servingGrams && servingGrams > 0 && servingGrams < 2000) {
    food.servingGrams = round(servingGrams, 0);
    if (p.serving_size) food.servingLabel = p.serving_size.trim().slice(0, 40);
  }
  if (p.image_front_small_url?.startsWith('https://')) food.imageUrl = p.image_front_small_url;
  return { food, missing };
}

async function getJson(url: string, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  if (signal?.aborted) throw new OffError('aborted');
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    } catch {
      if (signal?.aborted) throw new OffError('aborted');
      if (timedOut) throw new OffError('timeout');
      throw new OffError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network');
    }
    if (res.status === 429) throw new OffError('rate', 60_000);
    if (res.status === 503) throw new OffError('rate', 30_000);
    if (res.status >= 500) throw new OffError('server');
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      if (signal?.aborted) throw new OffError('aborted');
      if (res.status === 404) throw new OffError('notfound');
      throw new OffError('server');
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchProduct(code: string, signal?: AbortSignal): Promise<MappedProduct> {
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`;
  const { body } = await getJson(url, signal);
  const b = body as { status?: number; product?: OffProduct } | null;
  if (!b || b.status !== 1 || !b.product) throw new OffError('notfound');
  const mapped = mapProduct({ ...b.product, code: b.product.code || code });
  if (!mapped) throw new OffError('notfound');
  return mapped;
}

export const SEARCH_PAGE_SIZE = 20;

export function searchUrl(q: string): string {
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    lc: 'fr',
    page_size: String(SEARCH_PAGE_SIZE),
    fields: FIELDS,
  });
  return `${OFF_BASE}/cgi/search.pl?${params}`;
}

export async function searchProducts(q: string, signal?: AbortSignal): Promise<Food[]> {
  const { body } = await getJson(searchUrl(q), signal);
  const products = (body as { products?: OffProduct[] } | null)?.products ?? [];
  const out: Food[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const m = mapProduct(p);
    // Results without calories or a name are noise in a calorie tracker.
    if (!m || m.missing.includes('kcal') || m.food.name === 'Produit sans nom' || seen.has(m.food.id)) continue;
    seen.add(m.food.id);
    out.push(m.food);
  }
  return out;
}

/** Valid EAN-8 / EAN-13 / UPC-A checksum. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => (sum += i % 2 === 0 ? d * 3 : d));
  return (10 - (sum % 10)) % 10 === check;
}

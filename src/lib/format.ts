const int = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const dec1Fixed = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Integer with French grouping (2 100). */
export const fmtInt = (n: number): string => int.format(Math.round(n));

/** Up to one decimal (12,5 / 12). */
export const fmtDec = (n: number): string => dec1.format(n);

/** Always one decimal (72,0). */
export const fmtKg = (n: number): string => dec1Fixed.format(n);

/** Signed value with one decimal, e.g. +0,3 or -1,2. */
export function fmtSigned(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '0';
  return (r > 0 ? '+' : '-') + dec1.format(Math.abs(r));
}

/** Accepts "72,5", "72.5", " 72 ". Returns null when not a finite number. */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Number to an editable string with a French decimal comma. */
export function toInputString(n: number | undefined | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '';
  const f = 10 ** digits;
  return String(Math.round(n * f) / f).replace('.', ',');
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

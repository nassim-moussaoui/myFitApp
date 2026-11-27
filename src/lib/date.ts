/** Local calendar dates as YYYY-MM-DD strings. Never use toISOString (UTC). */

export type ISODate = string;

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses a YYYY-MM-DD string to a local Date at noon (safe across DST changes). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

/** Age in full years at `on`. */
export function ageOn(birthDate: ISODate, on: ISODate): number {
  const b = parseISODate(birthDate);
  const t = parseISODate(on);
  let age = t.getFullYear() - b.getFullYear();
  const beforeBirthday =
    t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate());
  if (beforeBirthday) age--;
  return age;
}

const longFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export function relativeDayLabel(s: ISODate, today: ISODate): string {
  const d = diffDays(today, s);
  if (d === 0) return "Aujourd'hui";
  if (d === -1) return 'Hier';
  if (d === 1) return 'Demain';
  return capitalize(weekdayFmt.format(parseISODate(s)));
}

export function longDayLabel(s: ISODate): string {
  return capitalize(longFmt.format(parseISODate(s)));
}

export function shortDayLabel(s: ISODate): string {
  return shortFmt.format(parseISODate(s));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

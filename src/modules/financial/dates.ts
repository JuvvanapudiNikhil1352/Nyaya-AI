/**
 * Date arithmetic for the calculation engine. Dates are ISO "YYYY-MM-DD"
 * strings handled in UTC, so results never depend on the server's time zone.
 */

const DAY_MS = 86_400_000;

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

export function toUTC(iso: string): number {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
}

/** Same day n months later; the day is clamped to the month's end (31 Jan + 1 = 28/29 Feb). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return fromUTC(Date.UTC(ty, tm - 1, Math.min(d, daysInMonth(ty, tm))));
}

/** Whole monthly anniversaries of `start` reached on or before `d`. */
export function wholeMonths(start: string, d: string): number {
  const [sy, sm] = parts(start);
  const [dy, dm] = parts(d);
  let n = (dy - sy) * 12 + (dm - sm);
  while (n > 0 && addMonths(start, n) > d) n--;
  while (addMonths(start, n + 1) <= d) n++;
  return Math.max(0, n);
}

/**
 * Months elapsed from `start` to `d` by calendar: whole monthly anniversaries,
 * plus the part-month as a share of that month's length. Exact on anniversaries.
 */
export function calendarMonths(start: string, d: string): number {
  if (d <= start) return 0;
  const n = wholeMonths(start, d);
  const from = addMonths(start, n);
  const to = addMonths(start, n + 1);
  return n + daysBetween(from, d) / daysBetween(from, to);
}

/** Days between two dates using the 30/360 convention. */
export function days30360(a: string, b: string): number {
  const [y1, m1, d1raw] = parts(a);
  const [y2, m2, d2raw] = parts(b);
  const d1 = Math.min(d1raw, 30);
  const d2 = d2raw === 31 && d1 === 30 ? 30 : d2raw;
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

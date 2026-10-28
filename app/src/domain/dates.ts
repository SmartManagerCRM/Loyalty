/** Date helpers. Timestamps are stored as UTC ISO strings; "dates" (birthday, due) are local YYYY-MM-DD. */
const DAY = 86_400_000;

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date (YYYY-MM-DD) of an instant. */
export function localDate(d: Date | string | number): string {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

/** Whole local calendar days between two local dates (b - a). DST-safe. */
export function dayDiff(aYmd: string, bYmd: string): number {
  const [ay, am, ad] = aYmd.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = bYmd.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** Start of the local day as UTC ISO. */
export function startOfLocalDayIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}
export function endOfLocalDayIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Birthday stored as YYYY-MM-DD or --MM-DD (year unknown). Days until next occurrence (0 = today). */
export function daysUntilBirthday(birthday: string | null, todayYmd: string): number | null {
  if (!birthday) return null;
  const m = /^(?:\d{4}|-)-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(todayYmd.slice(0, 4));
  const candidate = (y: number) => {
    // Feb 29 falls back to Mar 1 in non-leap years
    const dt = new Date(Date.UTC(y, month - 1, day));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  };
  let diff = dayDiff(todayYmd, candidate(year));
  if (diff < 0) diff = dayDiff(todayYmd, candidate(year + 1));
  return diff;
}

/** Convert a local date + time of day string to a UTC ISO instant. Time defaults to now's time when same day. */
export function localDateToIso(ymd: string, now: Date = new Date()): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const todayYmd = localDate(now);
  if (ymd === todayYmd) return now.toISOString();
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

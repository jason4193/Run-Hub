/**
 * Sydney-local dates for the Sync (pure, unit-tested). "Today" is always the Australia/Sydney
 * date, never the UTC one (docs/CONTEXT.md).
 */
export const SYDNEY_TZ = "Australia/Sydney";

/** `now` as a Sydney-local YYYY-MM-DD date. */
export function sydneyToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The calendar date `days` after `isoDate` (both YYYY-MM-DD). Pure date arithmetic, no time zone. */
export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** True when `isoDate` (YYYY-MM-DD) is a Monday. */
export function isMonday(isoDate: string): boolean {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay() === 1;
}

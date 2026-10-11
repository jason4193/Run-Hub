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

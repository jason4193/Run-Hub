/**
 * Pure intervals.icu helpers for the Sync — no network, no env — so they can be unit-tested.
 */
export const BACKFILL_OLDEST = "2000-01-01";

/**
 * Activity list query. No `newest`: intervals.icu defaults it to "now" in the athlete's
 * timezone (Australia/Sydney), so a Sydney-morning run is never cut off by a UTC date.
 */
export function activityListPath(athleteId: string, fields: string): string {
  return `/api/v1/athlete/${athleteId}/activities?oldest=${BACKFILL_OLDEST}&fields=${encodeURIComponent(fields)}`;
}

/** Pace-curve query up to "now" (athlete timezone). No `newest`, for the same reason. */
export function paceCurvePath(athleteId: string, gap: boolean): string {
  const base = `/api/v1/athlete/${athleteId}/pace-curves.json?type=Run`;
  return gap ? `${base}&gap=true` : base;
}

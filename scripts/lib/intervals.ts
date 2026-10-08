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

export type ListFailure = { status: number } | { networkError: string };

/** Human-readable cause for a failed activity-list call (the one failure that fails the Sync). */
export function describeListFailure(failure: ListFailure): string {
  if ("networkError" in failure) {
    return `intervals.icu unavailable (network error: ${failure.networkError}) — will retry on next scheduled run`;
  }
  const { status } = failure;
  if (status === 401 || status === 403) return `INTERVALS_API_KEY rejected by intervals.icu (${status}) — rotate the secret`;
  if (status === 404) return "Athlete not found (404) — check INTERVALS_ATHLETE_ID";
  if (status >= 500) return `intervals.icu unavailable (${status}) — will retry on next scheduled run`;
  return `intervals.icu activity list failed (${status})`;
}

/** Wrap a message as a GitHub Actions error annotation (run page + failure email) when in CI. */
export function asErrorAnnotation(message: string, inCi: boolean): string {
  return inCi ? `::error title=Sync failed::${message}` : message;
}

/** A failure with a known, human-readable cause; printed without a stack trace. */
export class SyncError extends Error {}

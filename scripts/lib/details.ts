/**
 * Run Details (docs/CONTEXT.md) — per-run HR, effort, notes and Intervals. Pure, no network.
 * Keys keep intervals.icu's own field names. Absent values and blank text are null, never 0 or "".
 *
 * A run's intervals are fetched again only when it has none stored yet ("new"), when
 * intervals.icu's `analyzed` time has moved since we stored them ("edited" — any edit to the run
 * moves it), or when the run is under RECENT_DAYS old ("recent"). Every other field comes from the
 * list call and refreshes on every Sync. The marker is intervals.icu's `analyzed`, never our fetch
 * time, so an unchanged run leaves the file byte-identical (see lib/snapshot.ts).
 */
export const RECENT_DAYS = 14;

/** A list-call row, as far as Run Details reads it. The list omits null fields. */
export interface ListRun {
  id: string;
  type?: string;
  name?: string;
  start_date_local?: string;
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  icu_hr_zone_times?: number[];
  icu_hr_zones?: number[];
  icu_rpe?: number;
  feel?: number;
  description?: string;
  analyzed?: string;
}

/** One interval from `/activity/{id}/intervals` (only the fields Run Details keeps). */
export interface RawInterval {
  type?: string | null;
  label?: string | null;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
}

export interface DetailInterval {
  type: string | null;
  label: string | null;
  distance: number | null;
  moving_time: number | null;
  elapsed_time: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
}

export interface RunDetail {
  id: string;
  start_date_local: string | null;
  type: string | null;
  name: string | null;
  distance: number | null;
  moving_time: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  icu_hr_zone_times: number[] | null;
  icu_hr_zones: number[] | null;
  icu_rpe: number | null;
  feel: number | null;
  description: string | null;
  /** intervals.icu's `analyzed` time of the stored intervals; null when none were fetched yet. */
  analyzed: string | null;
  /** null = not fetched yet; [] = none detected. */
  icu_intervals: DetailInterval[] | null;
}

export interface RunDetailsSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  runs: RunDetail[];
}

export type FetchReason = "new" | "edited" | "recent";

const blankToNull = (s: string | null | undefined): string | null => (s == null || s.trim() === "" ? null : s);

/** True when the run's local start date is `today` or one of the RECENT_DAYS − 1 days before it. */
export function isRecent(startDateLocal: string, today: string): boolean {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDateLocal.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  return days < RECENT_DAYS;
}

/** Why this run's intervals must be fetched this Sync, or null when the stored ones stand. */
export function intervalsFetchReason(run: ListRun, prior: RunDetail | undefined, today: string): FetchReason | null {
  if (!prior || prior.icu_intervals === null) return "new";
  if ((run.analyzed ?? null) !== prior.analyzed) return "edited";
  if (run.start_date_local && isRecent(run.start_date_local, today)) return "recent";
  return null;
}

export function toDetailInterval(raw: RawInterval): DetailInterval {
  return {
    type: raw.type ?? null,
    label: blankToNull(raw.label),
    distance: raw.distance ?? null,
    moving_time: raw.moving_time ?? null,
    elapsed_time: raw.elapsed_time ?? null,
    average_heartrate: raw.average_heartrate ?? null,
    max_heartrate: raw.max_heartrate ?? null,
  };
}

export function toRunDetail(run: ListRun, intervals: DetailInterval[] | null, analyzed: string | null): RunDetail {
  return {
    id: run.id,
    start_date_local: blankToNull(run.start_date_local),
    type: blankToNull(run.type),
    name: blankToNull(run.name),
    distance: run.distance ?? null,
    moving_time: run.moving_time ?? null,
    average_heartrate: run.average_heartrate ?? null,
    max_heartrate: run.max_heartrate ?? null,
    icu_hr_zone_times: run.icu_hr_zone_times ?? null,
    icu_hr_zones: run.icu_hr_zones ?? null,
    icu_rpe: run.icu_rpe ?? null,
    feel: run.feel ?? null,
    description: blankToNull(run.description),
    analyzed,
    icu_intervals: intervals,
  };
}

/**
 * This Sync's rows: one per listed run (runs deleted upstream drop out), newest first.
 * `fetched` holds only successful interval fetches. A run missing from it keeps its stored
 * intervals and `analyzed`, so a failed fetch is retried next Sync, or gets null for both when it
 * never had any.
 */
export function mergeRunDetails(
  runs: ListRun[],
  prior: Map<string, RunDetail>,
  fetched: Map<string, DetailInterval[]>,
): RunDetail[] {
  return runs
    .map((run) => {
      const got = fetched.get(run.id);
      if (got) return toRunDetail(run, got, run.analyzed ?? null);
      const old = prior.get(run.id);
      return toRunDetail(run, old?.icu_intervals ?? null, old?.analyzed ?? null);
    })
    .sort((a, b) => (b.start_date_local ?? "").localeCompare(a.start_date_local ?? ""));
}

/**
 * Sessions (#7): every run in Run Details as a row of data/training/sessions.json, matched to its Week's sessions. Pure, no I/O. See ADR 0005.
 */
import type { RunDetail } from "./details.ts";
import type { Notes, NoteEntry } from "./notes.ts";
import type { Plan, QualityTarget } from "./plan.ts";
import { paceSeconds, resolvePace, weekEnd, weekOf, weekView } from "./plan-view.ts";
import { formatSeconds, noteReps, shapeReps, type Rep, type RepSize, type ShapeTarget } from "./reps.ts";

export type SessionType = "quality" | "long" | "easy" | "bagels" | "test" | "race" | "unplanned";

/** One row of data/training/sessions.json. Keys in this order. */
export interface SessionRow {
  date: string;
  id: string;
  type: SessionType;
  distance_m: number | null;
  moving_s: number | null;
  pace_s_per_km: number | null;
  pace: string | null;
  avg_hr_bpm: number | null;
  max_hr_bpm: number | null;
  hr_zone_s: number[] | null;
  rpe: number | null;
  feel: number | null;
  name: string | null;
  note: string | null;
  plan_session_id: string | null;
  under_cap: boolean | null;
  reps: Rep[];
}

export interface Derived {
  sessions: SessionRow[];
  log: string[];
}

export class DeriveError extends Error {
  override name = "DeriveError";
}

const KEYWORDS = /quality|time trial|tempo|checkpoint|test|interval|lap|\d+\s*x\s*\d+/i;
const BAGELS_BEFORE = "10:00";
const BAGELS_MIN_M = 6000;
const BAGELS_MAX_M = 10000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** In the week still running, the longest run is the Long Run only from this share of its target (the Coach's "done" line). */
const LONG_SO_FAR_SHARE = 0.8;

/** A run with its local date, clock and Week, computed once. */
interface Timed {
  run: RunDetail;
  start: string;
  date: string;
  clock: string;
  week: number | null;
}

const distanceOf = (t: Timed) => t.run.distance ?? 0;

/** The longest run; ties go to the earlier start. Null for none. */
function longest(list: Timed[]): Timed | null {
  return [...list].sort((a, b) => distanceOf(b) - distanceOf(a) || a.start.localeCompare(b.start))[0] ?? null;
}

/**
 * Walks the levels in order. The first level with runs decides: one run wins, two or more are a tie
 * (logged, left unmatched, later levels not tried).
 */
function firstMatch(n: number, kind: string, levels: { label: string; runs: Timed[] }[], log: string[]): Timed | null {
  for (const { label, runs } of levels) {
    if (runs.length === 0) continue;
    if (runs.length === 1) return runs[0];
    log.push(`Week ${n}: ${kind} tied at ${label} between ${runs.map((t) => t.run.id).join(", ")}; left unmatched`);
    return null;
  }
  return null;
}

/** A quality target as the shape it must show in a run's segments; null while its pace is unset (max even). */
function shapeTarget(plan: Plan, target: QualityTarget): ShapeTarget | null {
  const pace = resolvePace(plan, target.pace);
  if (pace === null) return null;
  let size: RepSize;
  if (target.distance_m !== undefined) size = { kind: "distance", distance_m: target.distance_m };
  else if (target.duration_s !== undefined) size = { kind: "duration", duration_s: target.duration_s };
  else if (target.laps_per_rep !== undefined) size = { kind: "laps", laps_per_rep: target.laps_per_rep, lap_m: plan.block.lap_m };
  else return null;
  return { reps: target.reps, pace_s_per_km: paceSeconds(pace), size };
}

/** A run has the test's or quality's shape when it holds at least half the planned reps (one at least). */
function fits(t: Timed, st: ShapeTarget): boolean {
  return shapeReps(t.run.icu_intervals ?? [], st).length >= Math.max(1, Math.ceil(st.reps / 2));
}

/** The test day's run: the only run that day, else the one run passing the shape, else the longest. Null when none that day. */
function testDayRun(onDate: Timed[], st: ShapeTarget | null): Timed | null {
  if (onDate.length <= 1) return onDate[0] ?? null;
  const passing = st ? onDate.filter((t) => fits(t, st)) : [];
  if (passing.length === 1) return passing[0];
  return longest(passing.length >= 2 ? passing : onDate);
}

/**
 * Every run as a row, newest first, matched to the Plan's sessions. `today` (Sydney YYYY-MM-DD) tells a finished
 * week from the one still running. Throws DeriveError on a Note pointing at the wrong run.
 */
export function deriveSessions(runs: RunDetail[], plan: Plan, notes: Notes, today: string): Derived {
  const log: string[] = [];

  const valid: Timed[] = [];
  for (const run of runs) {
    if (run.start_date_local === null) {
      log.push(`${run.id}: no start date; skipped`);
      continue;
    }
    const start = run.start_date_local;
    valid.push({ run, start, date: start.slice(0, 10), clock: start.slice(11, 16), week: weekOf(plan, start.slice(0, 10)) });
  }

  const noteFor = new Map<string, NoteEntry>();
  for (const [date, entry] of Object.entries(notes.entries)) {
    if (entry.activity_id !== undefined) {
      const id = entry.activity_id;
      const run = runs.find((r) => r.id === id);
      if (!run) throw new DeriveError(`training/notes.yaml: entries.${date}.activity_id: ${id} is not in data/run-details.json`);
      const runDate = run.start_date_local?.slice(0, 10) ?? null;
      if (runDate !== date) throw new DeriveError(`training/notes.yaml: entries.${date}.activity_id: ${id} is a run on ${runDate}`);
      noteFor.set(id, entry);
      continue;
    }
    const onDay = valid.filter((t) => t.date === date);
    if (onDay.length === 0) {
      log.push(`training/notes.yaml: entries.${date}: no run on that date yet; skipped`);
      continue;
    }
    noteFor.set(longest(onDay)!.run.id, entry);
  }

  const assigned = new Map<string, { type: SessionType; plan_session_id: string | null }>();
  const repsFor = new Map<string, Rep[]>();

  plan.weeks.forEach((_, n) => {
    const view = weekView(plan, n);
    const weekRuns = valid.filter((t) => t.week === n);
    const st = shapeTarget(plan, view.quality.target);
    const dayRun = view.quality.kind === "test" ? testDayRun(weekRuns.filter((t) => t.date === view.quality.date), st) : null;

    const qualityRun = firstMatch(
      n,
      "quality",
      [
        { label: "note", runs: weekRuns.filter((t) => noteFor.get(t.run.id)?.session === view.quality.id) },
        { label: "test date", runs: dayRun ? [dayRun] : [] },
        { label: "shape", runs: st ? weekRuns.filter((t) => fits(t, st)) : [] },
        {
          label: "keyword",
          runs: weekRuns.filter((t) => KEYWORDS.test(`${t.run.name ?? ""}\n${t.run.description ?? ""}`)),
        },
      ],
      log,
    );
    if (qualityRun) {
      assigned.set(qualityRun.run.id, { type: view.quality.kind, plan_session_id: view.quality.id });
      const target = view.quality.target;
      const { lap_m } = plan.block;
      const noteDistance =
        target.distance_m ?? (target.laps_per_rep !== undefined ? Math.round((target.laps_per_rep * (lap_m[0] + lap_m[1])) / 2) : null);
      const entry = noteFor.get(qualityRun.run.id);
      const reps = entry?.reps
        ? noteReps(entry.reps, entry.all_out ?? [], noteDistance)
        : st
          ? shapeReps(qualityRun.run.icu_intervals ?? [], st)
          : [];
      repsFor.set(qualityRun.run.id, reps);
      if (reps.length !== target.reps) {
        log.push(
          `${qualityRun.date} ${qualityRun.run.id} ${view.quality.id}: ${reps.length} reps against ${target.reps} planned`,
        );
      }
    }

    const bagels = plan.block.bagels_run;
    const isBagels = (t: Timed) =>
      bagels !== undefined &&
      t !== qualityRun &&
      noteFor.get(t.run.id)?.session === undefined &&
      WEEKDAYS[new Date(`${t.date}T00:00:00Z`).getUTCDay()] === bagels.weekday &&
      t.clock < BAGELS_BEFORE &&
      distanceOf(t) >= BAGELS_MIN_M &&
      distanceOf(t) <= BAGELS_MAX_M &&
      t.date >= bagels.from;
    for (const t of weekRuns) {
      if (isBagels(t)) assigned.set(t.run.id, { type: "bagels", plan_session_id: null });
    }

    const rest = weekRuns.filter((t) => t !== qualityRun && !isBagels(t));
    const longEnough = today > weekEnd(plan, n) ? rest : rest.filter((t) => distanceOf(t) >= LONG_SO_FAR_SHARE * view.long.target.distance_km * 1000);
    const longRun = firstMatch(
      n,
      "long",
      [
        { label: "note", runs: rest.filter((t) => noteFor.get(t.run.id)?.session === view.long.id) },
        {
          label: "race date",
          runs: view.long.kind === "race" ? longestAsList(rest.filter((t) => t.date === view.long.date)) : [],
        },
        { label: "distance", runs: longestAsList(longEnough) },
      ],
      log,
    );
    if (longRun) assigned.set(longRun.run.id, { type: view.long.kind, plan_session_id: view.long.id });

    for (const t of weekRuns) {
      if (!assigned.has(t.run.id)) assigned.set(t.run.id, { type: "easy", plan_session_id: null });
    }
  });

  const hrCap = (date: string) => plan.block.hr_cap.filter((c) => c.from <= date).at(-1) ?? null;

  const rows = new Map<string, SessionRow>();
  for (const t of valid) {
    const { run } = t;
    const entry = noteFor.get(run.id);
    const tag = assigned.get(run.id) ?? { type: "unplanned" as SessionType, plan_session_id: null };
    const cap = hrCap(t.date);
    const reps = repsFor.get(run.id) ?? (entry?.reps ? noteReps(entry.reps, entry.all_out ?? [], null) : []);
    const pace_s_per_km =
      run.distance !== null && run.moving_time !== null && run.distance > 0
        ? Math.round((run.moving_time / run.distance) * 1000)
        : null;
    const note = [run.description, entry?.note].filter((s): s is string => s != null);
    rows.set(run.id, {
      date: t.date,
      id: run.id,
      type: tag.type,
      distance_m: run.distance === null ? null : Math.round(run.distance),
      moving_s: run.moving_time,
      pace_s_per_km,
      pace: pace_s_per_km === null ? null : formatSeconds(pace_s_per_km),
      avg_hr_bpm: run.average_heartrate,
      max_hr_bpm: run.max_heartrate,
      hr_zone_s: run.icu_hr_zone_times,
      rpe: run.icu_rpe,
      feel: run.feel,
      name: run.name,
      note: note.length > 0 ? note.join("\n") : null,
      plan_session_id: tag.plan_session_id,
      under_cap: run.average_heartrate === null || cap === null ? null : run.average_heartrate <= cap.bpm,
      reps,
    });
  }

  const sessions = [...valid]
    .sort((a, b) => b.start.localeCompare(a.start) || a.run.id.localeCompare(b.run.id))
    .map((t) => rows.get(t.run.id)!);

  return { sessions, log };
}

/** The longest run as a one-item list (none for an empty list). */
function longestAsList(list: Timed[]): Timed[] {
  const best = longest(list);
  return best ? [best] : [];
}

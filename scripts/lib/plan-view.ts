/**
 * What the Plan implies but doesn't store (ADR 0003): week dates, session ids, a week's phase,
 * resolved paces, lap times and session text. Pure, no I/O. The Plan comes from lib/plan.ts.
 */
import { addDays, daysBetween } from "./dates.ts";
import type { LongTarget, Phase, Plan, QualityPace, QualityTarget, Week } from "./plan.ts";

export type SessionKind = "quality" | "long";

/** One of a Week's two sessions, as a reader needs it. `date` is set only for the test and the race. */
export interface Session<Kind extends string, Target> {
  id: string;
  kind: Kind;
  date: string | null;
  target: Target;
  text: string;
}

export interface WeekView {
  n: number;
  start: string;
  end: string;
  phase: string;
  flag: Week["flag"];
  km: number;
  runs: [number, number];
  strength: number;
  notes: string[];
  quality: Session<"quality" | "test", QualityTarget>;
  long: Session<"long" | "race", LongTarget>;
}

/** Monday of Week n (YYYY-MM-DD). */
export function weekStart(plan: Plan, n: number): string {
  return addDays(plan.block.start, 7 * n);
}

/** Sunday of Week n (YYYY-MM-DD). */
export function weekEnd(plan: Plan, n: number): string {
  return addDays(plan.block.start, 7 * n + 6);
}

/** The Week containing `date` (YYYY-MM-DD), or null when it falls outside the Plan. */
export function weekOf(plan: Plan, date: string): number | null {
  const days = daysBetween(plan.block.start, date);
  const n = Math.floor(days / 7);
  return days < 0 || n >= plan.weeks.length ? null : n;
}

/** `w04-quality`, `w20-long`. */
export function sessionId(n: number, kind: SessionKind): string {
  return `w${String(n).padStart(2, "0")}-${kind}`;
}

/** The phase Week n belongs to: the last phase starting at or before it. */
export function phaseOf(plan: Plan, n: number): Phase {
  return plan.phases.filter((p) => p.from_week <= n).at(-1) ?? plan.phases[0];
}

/** A quality pace as "m:ss": threshold and test resolve from the Plan; null while unset, and for max_even. */
export function resolvePace(plan: Plan, pace: QualityPace): string | null {
  if (pace === "threshold") return plan.block.threshold.pace;
  if (pace === "test") return plan.goals.four_lap.pace;
  if (pace === "max_even") return null;
  return pace;
}

/** "4:10" → 250 seconds per km. */
export function paceSeconds(pace: string): number {
  const [m, s] = pace.split(":").map(Number);
  return m * 60 + s;
}

/** Seconds per lap at a "m:ss" pace, for the shortest and longest lap: [min, max]. */
export function lapRange(plan: Plan, pace: string): [number, number] {
  const perKm = paceSeconds(pace);
  return [Math.round((perKm * plan.block.lap_m[0]) / 1000), Math.round((perKm * plan.block.lap_m[1]) / 1000)];
}

const PACE_WORDS: Record<string, string> = { threshold: "threshold", test: "test pace", max_even: "max even" };

const duration = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);

function repSize(t: QualityTarget): string {
  if (t.laps_per_rep !== undefined) return t.laps_per_rep === 1 ? "1 lap" : `${t.laps_per_rep} laps`;
  if (t.distance_m !== undefined) return t.distance_m % 1000 === 0 ? `${t.distance_m / 1000} km` : `${t.distance_m} m`;
  return duration(t.duration_s ?? 0);
}

/** "6 × 2 laps @ 4:15, 90 s rest", "30 min @ max even". */
export function describeQuality(t: QualityTarget): string {
  const size = t.reps === 1 ? repSize(t) : `${t.reps} × ${repSize(t)}`;
  const rest = t.rest_s === undefined ? "" : `, ${duration(t.rest_s)} rest`;
  return `${size} @ ${PACE_WORDS[t.pace] ?? t.pace}${rest}`;
}

/** "12 km easy", "18 km @ 7:00–7:15", "42.2 km @ 7:00". */
export function describeLong(t: LongTarget): string {
  if (t.pace === "easy") return `${t.distance_km} km easy`;
  if (Array.isArray(t.pace)) return `${t.distance_km} km @ ${t.pace[0]}–${t.pace[1]}`;
  return `${t.distance_km} km @ ${t.pace}`;
}

/** Week n's Quality Session; the test resolves from goals.four_lap. */
function qualitySession(plan: Plan, n: number, quality: Week["quality"]): WeekView["quality"] {
  const id = sessionId(n, "quality");
  if (quality !== "test") return { id, kind: "quality", date: null, target: quality, text: describeQuality(quality) };
  const { date, reps, laps_per_rep, rest_s } = plan.goals.four_lap;
  const target: QualityTarget = { reps, laps_per_rep, pace: "test", rest_s };
  return { id, kind: "test", date, target, text: `Test: ${describeQuality(target)}` };
}

/** Week n's Long Run; the race resolves from goals.osaka. */
function longSession(plan: Plan, n: number, long: Week["long"]): WeekView["long"] {
  const id = sessionId(n, "long");
  if (long !== "race") return { id, kind: "long", date: null, target: long, text: describeLong(long) };
  const { date, distance_km, pace } = plan.goals.osaka;
  const target: LongTarget = { distance_km, pace };
  return { id, kind: "race", date, target, text: `Race: ${describeLong(target)}` };
}

/** Everything about Week n, with the test and the race resolved from goals. Throws when there is no Week n. */
export function weekView(plan: Plan, n: number): WeekView {
  const week = plan.weeks[n];
  if (!week) throw new RangeError(`No Week ${n} in the Plan`);
  return {
    n,
    start: weekStart(plan, n),
    end: weekEnd(plan, n),
    phase: phaseOf(plan, n).name,
    flag: week.flag,
    km: week.km,
    runs: week.runs,
    strength: week.strength,
    notes: week.notes,
    quality: qualitySession(plan, n, week.quality),
    long: longSession(plan, n, week.long),
  };
}

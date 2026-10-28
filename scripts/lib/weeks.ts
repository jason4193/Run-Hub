/**
 * Weeks (#8): one row per Plan week, targets against actuals. Pure, no I/O. easy_share judges each easy or long run by its average HR against the cap in force (under_cap); zone times are summed in easy_zones for the Coach and never decide "easy".
 */
import { daysBetween } from "./dates.ts";
import type { RunDetail } from "./details.ts";
import type { Plan } from "./plan.ts";
import { paceSeconds, resolvePace, weekOf, weekView } from "./plan-view.ts";
import { formatSeconds } from "./reps.ts";
import type { SessionRow } from "./sessions.ts";

export type WeekState = "finished" | "current" | "future";
export type TargetStatus = "done" | "partial" | "pending" | "missed";

export interface QualityBlock {
  id: string;
  kind: "quality" | "test";
  text: string;
  status: "done" | "pending" | "missed";
  run_id: string | null;
  date: string | null;
  reps: number;
  reps_planned: number;
  spread_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_pace: string | null;
  target_pace_s_per_km: number | null;
  target_pace: string | null;
  delta_s: number | null;
  all_out: number[];
}
export interface LongBlock {
  id: string;
  kind: "long" | "race";
  text: string;
  status: TargetStatus;
  planned_km: number;
  actual_km: number | null;
  run_id: string | null;
  date: string | null;
}
export interface BagelsBlock {
  status: "done" | "pending" | "missed" | null;
  run_id: string | null;
  date: string | null;
}
export interface EasyZones {
  bounds_bpm: number[] | null;
  s: number[];
}
export interface WeekRow {
  n: number;
  from: string;
  to: string;
  phase: string;
  state: WeekState;
  km: { planned: number; actual: number };
  runs: { count: number; min: number; max: number };
  strength: { planned: number };
  quality: QualityBlock;
  long: LongBlock;
  bagels: BagelsBlock;
  easy_share: number | null;
  moderate_share: number | null;
  easy_zones: EasyZones | null;
  flags: never[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DONE_SHARE = 0.8;
const SAME_RUN_GAP_S = 600;

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const startSeconds = (run: RunDetail) => Date.parse(`${run.start_date_local}Z`) / 1000;

/** Activities in a week, warm-ups and cool-downs joined: a gap of 600 s or less after the previous one ends is the same run. */
function countRuns(rows: SessionRow[], byId: Map<string, RunDetail>): number {
  const found = rows.map((r) => byId.get(r.id)).filter((r): r is RunDetail => r !== undefined && r.start_date_local !== null);
  found.sort((a, b) => startSeconds(a) - startSeconds(b));
  let count = 0;
  let prev: RunDetail | null = null;
  for (const run of found) {
    if (prev === null || startSeconds(run) > startSeconds(prev) + (prev.moving_time ?? 0) + SAME_RUN_GAP_S) count++;
    prev = run;
  }
  return count;
}

/** One row per Plan week, W0 first. `sessions` from deriveSessions, `runs` the same Run Details it was given. */
export function deriveWeeks(sessions: SessionRow[], runs: RunDetail[], plan: Plan, today: string): WeekRow[] {
  const byId = new Map(runs.map((r) => [r.id, r]));
  return plan.weeks.map((_, n): WeekRow => {
    const view = weekView(plan, n);
    const from = view.start;
    const to = view.end;
    const state: WeekState = today > to ? "finished" : today < from ? "future" : "current";
    const finished = state === "finished";
    const rows = sessions.filter((s) => s.date >= from && s.date <= to);

    const qRow = rows.find((s) => s.plan_session_id === view.quality.id);
    const qReps = qRow?.reps ?? [];
    const counted = qReps.filter((r) => !r.all_out);
    const withDistance = counted.filter((r) => r.distance_m !== null && r.distance_m > 0);
    const times = counted.map((r) => r.time_s);
    const avgPace =
      withDistance.length === 0
        ? null
        : Math.round(
            (withDistance.reduce((a, r) => a + r.time_s, 0) / withDistance.reduce((a, r) => a + (r.distance_m ?? 0), 0)) * 1000,
          );
    const targetPace = resolvePace(plan, view.quality.target.pace);
    const targetSeconds = targetPace === null ? null : paceSeconds(targetPace);
    const quality: QualityBlock = {
      id: view.quality.id,
      kind: view.quality.kind,
      text: view.quality.text,
      status: qRow ? "done" : finished ? "missed" : "pending",
      run_id: qRow?.id ?? null,
      date: qRow?.date ?? null,
      reps: qReps.length,
      reps_planned: view.quality.target.reps,
      spread_s: times.length < 2 ? null : Math.max(...times) - Math.min(...times),
      avg_pace_s_per_km: avgPace,
      avg_pace: avgPace === null ? null : formatSeconds(avgPace),
      target_pace_s_per_km: targetSeconds,
      target_pace: targetPace,
      delta_s: avgPace === null || targetSeconds === null ? null : avgPace - targetSeconds,
      all_out: qReps.filter((r) => r.all_out).map((r) => r.n),
    };

    const lRow = rows.find((s) => s.plan_session_id === view.long.id);
    const plannedKm = view.long.target.distance_km;
    const longDone = lRow !== undefined && (lRow.distance_m ?? 0) >= LONG_DONE_SHARE * plannedKm * 1000;
    const long: LongBlock = {
      id: view.long.id,
      kind: view.long.kind,
      text: view.long.text,
      status: longDone ? "done" : !finished ? "pending" : lRow ? "partial" : "missed",
      planned_km: plannedKm,
      actual_km: lRow ? Math.round((lRow.distance_m ?? 0) / 100) / 10 : null,
      run_id: lRow?.id ?? null,
      date: lRow?.date ?? null,
    };

    const bagelsPlan = plan.block.bagels_run;
    const bRow = rows.find((s) => s.type === "bagels");
    const testOnBagelsDay =
      view.quality.kind === "test" &&
      view.quality.date !== null &&
      bagelsPlan !== undefined &&
      WEEKDAYS[new Date(`${view.quality.date}T00:00:00Z`).getUTCDay()] === bagelsPlan.weekday;
    const bagelsOff = bagelsPlan === undefined || to < bagelsPlan.from || testOnBagelsDay;
    const bagels: BagelsBlock = {
      status: bagelsOff ? null : bRow ? "done" : finished ? "missed" : "pending",
      run_id: bRow?.id ?? null,
      date: bRow?.date ?? null,
    };

    const easyRows = rows.filter((s) => s.type === "easy" || s.type === "long");
    const judged = easyRows.filter((s) => s.under_cap !== null);
    const judgedS = judged.reduce((a, s) => a + (s.moving_s ?? 0), 0);
    const underS = judged.filter((s) => s.under_cap === true).reduce((a, s) => a + (s.moving_s ?? 0), 0);
    const totalS = rows.reduce((a, s) => a + (s.moving_s ?? 0), 0);

    const zoned = easyRows.filter((s): s is SessionRow & { hr_zone_s: number[] } => s.hr_zone_s !== null);
    const boundsRun = zoned
      .map((s) => byId.get(s.id))
      .filter((r): r is RunDetail => r !== undefined && r.icu_hr_zones !== null && r.start_date_local !== null)
      .sort((a, b) => startSeconds(b) - startSeconds(a))[0];
    const zoneLength = Math.max(0, ...zoned.map((s) => s.hr_zone_s.length));
    const easyZones: EasyZones | null =
      zoned.length === 0
        ? null
        : {
            bounds_bpm: boundsRun?.icu_hr_zones ?? null,
            s: Array.from({ length: zoneLength }, (_, i) => zoned.reduce((a, s) => a + (s.hr_zone_s[i] ?? 0), 0)),
          };

    return {
      n,
      from,
      to,
      phase: view.phase,
      state,
      km: { planned: view.km, actual: round1(rows.reduce((a, s) => a + (s.distance_m ?? 0), 0) / 1000) },
      runs: { count: countRuns(rows, byId), min: view.runs[0], max: view.runs[1] },
      strength: { planned: view.strength },
      quality,
      long,
      bagels,
      easy_share: judgedS === 0 ? null : round2(underS / judgedS),
      moderate_share:
        bagels.status === null || totalS === 0 ? null : round2((bRow?.moving_s ?? 0) / totalS),
      easy_zones: easyZones,
      flags: [],
    };
  });
}

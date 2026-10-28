/**
 * Status (#8): the Coach's entry point, data/training/status.json. Pure, no I/O. One line and under 10 KB: last_4_weeks is slim, full rows live in weeks.json. Staleness is judged by the reader from generatedAt; days_since_last_run is rest, not a stopped Sync.
 */
import { daysBetween } from "./dates.ts";
import type { Flag } from "./flags.ts";
import type { Plan, QualityTarget } from "./plan.ts";
import { paceSeconds, resolvePace, weekEnd, weekStart, weekView } from "./plan-view.ts";
import { formatSeconds } from "./reps.ts";
import { DeriveError, type SessionRow } from "./sessions.ts";
import type { WeekRow } from "./weeks.ts";

export interface PaceCurveEntry {
  distance: number;
  label: string;
  timeSeconds: number;
  paceSecPerKm: number;
  date: string;
}
export interface PaceCurve {
  pace: PaceCurveEntry[];
}
export const STATUS_MAX_BYTES = 10 * 1024;

interface WeekSpan {
  n: number;
  from: string;
  to: string;
}

export interface SlimWeek {
  n: number;
  from: string;
  km: WeekRow["km"];
  runs: WeekRow["runs"];
  quality: Pick<WeekRow["quality"], "status" | "spread_s" | "avg_pace" | "target_pace" | "delta_s">;
  long: Pick<WeekRow["long"], "status" | "planned_km" | "actual_km">;
  bagels: Pick<WeekRow["bagels"], "status">;
  easy_share: number | null;
  moderate_share: number | null;
}

export interface Status {
  schemaVersion: 1;
  generatedAt: string;
  today: string;
  sync: { last_activity_date: string | null; days_since_last_run: number | null; note: string };
  current_week: (Omit<WeekRow, "flags"> & { remaining: { km_left: number; runs_left: [number, number] } }) | null;
  next_quality: {
    id: string;
    week: WeekSpan;
    text: string;
    date: string | null;
    target: QualityTarget;
    rep_range_s: [number, number] | null;
    rep_range: string | null;
  } | null;
  goals: {
    four_lap: { date: string; days_left: number; test_pace: string; test_pace_status: string };
    osaka: { date: string; days_left: number; goal_finish_s: number; goal_finish: string };
  };
  checkpoints: { id: string; week: WeekSpan; verdict: string; note: string | null }[];
  last_4_weeks: SlimWeek[];
  best_efforts: { label: string; distance_m: number; time_s: number; time: string; pace_s_per_km: number; pace: string; date: string }[];
  flags: Flag[];
}

const SYNC_NOTE = "compare generatedAt to now; if > 2 days old the Action has stopped";
const BEST_EFFORT_DISTANCES = [400, 1000, 5000];
const LAST_WEEKS = 4;

const slim = (w: WeekRow): SlimWeek => ({
  n: w.n,
  from: w.from,
  km: w.km,
  runs: w.runs,
  quality: {
    status: w.quality.status,
    spread_s: w.quality.spread_s,
    avg_pace: w.quality.avg_pace,
    target_pace: w.quality.target_pace,
    delta_s: w.quality.delta_s,
  },
  long: { status: w.long.status, planned_km: w.long.planned_km, actual_km: w.long.actual_km },
  bagels: { status: w.bagels.status },
  easy_share: w.easy_share,
  moderate_share: w.moderate_share,
});

function nextQuality(weeks: WeekRow[], plan: Plan, today: string): Status["next_quality"] {
  const current = weeks.find((w) => w.state === "current");
  const next = current ? (current.quality.status === "pending" ? current : weeks[current.n + 1]) : today < weeks[0].from ? weeks[0] : undefined;
  if (!next) return null;
  const view = weekView(plan, next.n);
  const { target } = view.quality;
  const pace = resolvePace(plan, target.pace);
  let range: [number, number] | null = null;
  if (target.laps_per_rep !== undefined && pace !== null) {
    const p = paceSeconds(pace);
    const laps = target.laps_per_rep;
    range = [Math.round((p * laps * plan.block.lap_m[0]) / 1000), Math.round((p * laps * plan.block.lap_m[1]) / 1000)];
  }
  return {
    id: view.quality.id,
    week: { n: next.n, from: next.from, to: next.to },
    text: view.quality.text,
    date: view.quality.date,
    target,
    rep_range_s: range,
    rep_range: range === null ? null : `${formatSeconds(range[0])}–${formatSeconds(range[1])}`,
  };
}

export function deriveStatus(weeks: WeekRow[], sessions: SessionRow[], plan: Plan, paceCurve: PaceCurve, today: string, generatedAt: string): Status {
  const lastDate = sessions.filter((s) => s.date <= today).reduce<string | null>((a, s) => (a === null || s.date > a ? s.date : a), null);
  const current = weeks.find((w) => w.state === "current");
  const last4 = weeks.filter((w) => w.state === "finished").reverse().slice(0, LAST_WEEKS);
  const { four_lap, osaka } = plan.goals;

  let currentWeek: Status["current_week"] = null;
  if (current) {
    const { flags: _flags, ...rest } = current;
    currentWeek = {
      ...rest,
      remaining: {
        km_left: Math.max(0, Math.round((current.km.planned - current.km.actual) * 10) / 10),
        runs_left: [Math.max(0, current.runs.min - current.runs.count), Math.max(0, current.runs.max - current.runs.count)],
      },
    };
  }

  const flagWeeks = [...(current ? [current] : []), ...last4].sort((a, b) => a.n - b.n);
  return {
    schemaVersion: 1,
    generatedAt,
    today,
    sync: {
      last_activity_date: lastDate,
      days_since_last_run: lastDate === null ? null : daysBetween(lastDate, today),
      note: SYNC_NOTE,
    },
    current_week: currentWeek,
    next_quality: nextQuality(weeks, plan, today),
    goals: {
      four_lap: {
        date: four_lap.date,
        days_left: daysBetween(today, four_lap.date),
        test_pace: four_lap.pace,
        test_pace_status: four_lap.pace_status,
      },
      osaka: { date: osaka.date, days_left: daysBetween(today, osaka.date), goal_finish_s: osaka.goal_finish_s, goal_finish: formatSeconds(osaka.goal_finish_s) },
    },
    checkpoints: Object.entries(plan.checkpoints).map(([id, c]) => ({
      id,
      week: { n: c.week, from: weekStart(plan, c.week), to: weekEnd(plan, c.week) },
      verdict: c.verdict,
      note: c.note,
    })),
    last_4_weeks: last4.map(slim),
    best_efforts: BEST_EFFORT_DISTANCES.flatMap((d) => {
      const e = paceCurve.pace.find((p) => p.distance === d);
      if (!e) return [];
      const pace = Math.round(e.paceSecPerKm);
      return [{
        label: e.label,
        distance_m: e.distance,
        time_s: e.timeSeconds,
        time: formatSeconds(e.timeSeconds),
        pace_s_per_km: pace,
        pace: formatSeconds(pace),
        date: e.date.slice(0, 10),
      }];
    }),
    flags: flagWeeks.flatMap((w) => w.flags),
  };
}

/** JSON.stringify(status) + "\n" (one line). Throws DeriveError (from ./sessions.ts) when it is STATUS_MAX_BYTES or more. */
export function statusText(status: Status): string {
  const text = JSON.stringify(status) + "\n";
  const bytes = Buffer.byteLength(text);
  if (bytes >= STATUS_MAX_BYTES) throw new DeriveError(`status.json is ${bytes} bytes; it must stay under ${STATUS_MAX_BYTES}`);
  return text;
}

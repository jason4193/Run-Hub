/**
 * Flags (#8): mechanical checks for the Coach, never judgement. Pure, no I/O.
 */
import { addDays, daysBetween } from "./dates.ts";
import type { RunDetail } from "./details.ts";
import type { Plan } from "./plan.ts";
import { paceSeconds, weekOf } from "./plan-view.ts";
import { formatSeconds } from "./reps.ts";
import type { SessionRow } from "./sessions.ts";
import type { WeekRow } from "./weeks.ts";

export type FlagKind =
  | "consecutive"
  | "day_after_bagels"
  | "long_over_plan"
  | "over_cap"
  | "week_km"
  | "missed"
  | "spread"
  | "quality_candidate"
  | "easy_too_fast";
export interface Flag {
  kind: FlagKind;
  week: number;
  date: string | null;
  run_id: string | null;
  text: string;
  zone_s?: number[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_OVER_SHARE = 1.1;
const WEEK_KM_SHARE = 0.15;
const FAST_MARGIN_S = 30;
const FAST_SEGMENTS = 3;

/** "2026-10-21" → "21 Oct". */
const shortDate = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
const signedPercent = (actual: number, planned: number) => {
  const p = Math.round((actual / planned - 1) * 100);
  return `${p >= 0 ? "+" : ""}${p}%`;
};

const compareNullLast = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

/** Every mechanical flag across all weeks, sorted by week, then date (null last), then kind, then run_id. */
export function deriveFlags(rows: WeekRow[], sessions: SessionRow[], runs: RunDetail[], plan: Plan): Flag[] {
  const flags: Flag[] = [];
  const byId = new Map(runs.map((r) => [r.id, r]));
  const weekFor = (date: string) => weekOf(plan, date);

  const q = sessions.filter((s) => (s.type === "quality" || s.type === "test") && s.plan_session_id !== null);
  const l = sessions.filter((s) => s.plan_session_id?.endsWith("-long"));
  for (const qr of q) {
    for (const lr of l) {
      if (Math.abs(daysBetween(qr.date, lr.date)) !== 1) continue;
      const later = qr.date > lr.date ? qr : lr;
      const week = weekFor(later.date);
      if (week === null) continue;
      flags.push({
        kind: "consecutive", week, date: later.date, run_id: later.id,
        text: `Quality session (${shortDate(qr.date)}) and long run (${shortDate(lr.date)}) on consecutive days.`,
      });
    }
  }

  const bagelsDates = new Map(sessions.filter((s) => s.type === "bagels").map((s) => [s.date, s.date]));
  for (const qr of q) {
    const before = addDays(qr.date, -1);
    const week = weekFor(qr.date);
    if (week === null || !bagelsDates.has(before)) continue;
    flags.push({
      kind: "day_after_bagels", week, date: qr.date, run_id: qr.id,
      text: `Quality session (${shortDate(qr.date)}) the day after the Bagels Run (${shortDate(before)}).`,
    });
  }

  for (const s of sessions) {
    if ((s.type !== "easy" && s.type !== "long") || s.under_cap !== false) continue;
    const week = weekFor(s.date);
    const cap = plan.block.hr_cap.filter((c) => c.from <= s.date).at(-1);
    if (week === null || cap === undefined) continue;
    const flag: Flag = {
      kind: "over_cap", week, date: s.date, run_id: s.id,
      text: `${s.type === "long" ? "Long" : "Easy"} run over the HR cap: ${s.avg_hr_bpm} > ${cap.bpm} bpm.`,
    };
    if (s.hr_zone_s !== null) flag.zone_s = s.hr_zone_s;
    flags.push(flag);
  }

  for (const row of rows) {
    const { long, quality } = row;
    if (long.actual_km !== null && long.actual_km > LONG_OVER_SHARE * long.planned_km && long.date !== null && long.date <= plan.goals.four_lap.date) {
      flags.push({
        kind: "long_over_plan", week: row.n, date: long.date, run_id: long.run_id,
        text: `Long run ${long.actual_km} km against ${long.planned_km} planned (${signedPercent(long.actual_km, long.planned_km)}).`,
      });
    }
    if (row.state === "finished") {
      if (long.kind !== "race" && Math.abs(row.km.actual - row.km.planned) / row.km.planned > WEEK_KM_SHARE) {
        flags.push({
          kind: "week_km", week: row.n, date: null, run_id: null,
          text: `Week ${row.n}: ${row.km.actual} km against ${row.km.planned} (${signedPercent(row.km.actual, row.km.planned)}).`,
        });
      }
      if (quality.status === "missed") {
        flags.push({ kind: "missed", week: row.n, date: null, run_id: null, text: `Week ${row.n}: quality session missed.` });
      }
      if (long.status === "missed") {
        flags.push({ kind: "missed", week: row.n, date: null, run_id: null, text: `Week ${row.n}: long run missed.` });
      }
    }
    if (quality.spread_s !== null && quality.spread_s > plan.goals.four_lap.max_spread_s) {
      flags.push({
        kind: "spread", week: row.n, date: quality.date, run_id: quality.run_id,
        text: `Rep spread ${quality.spread_s} s, over ${plan.goals.four_lap.max_spread_s} s.`,
      });
    }
  }

  const threshold = plan.block.threshold.pace;
  if (threshold !== null) {
    const limit = paceSeconds(threshold) + FAST_MARGIN_S;
    for (const s of sessions) {
      const week = weekFor(s.date);
      if (week === null || s.type === "bagels") continue;
      const row = rows[week];
      if (s.id === row.quality.run_id) continue;
      const fast = (byId.get(s.id)?.icu_intervals ?? []).filter(
        (i) => i.distance !== null && i.distance > 0 && i.elapsed_time !== null && (i.elapsed_time / i.distance) * 1000 < limit,
      ).length;
      if (fast < FAST_SEGMENTS) continue;
      const lead = `${fast} segments faster than ${formatSeconds(limit)}/km`;
      const noQuality = row.quality.run_id === null;
      flags.push({
        kind: noQuality ? "quality_candidate" : "easy_too_fast", week, date: s.date, run_id: s.id,
        text: noQuality ? `${lead}; no quality session matched this week.` : `${lead} on an easy run.`,
      });
    }
  }

  return flags.sort(
    (a, b) =>
      a.week - b.week ||
      compareNullLast(a.date, b.date) ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
      compareNullLast(a.run_id, b.run_id),
  );
}

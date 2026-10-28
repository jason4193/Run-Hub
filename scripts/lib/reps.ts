/**
 * Reps (#7, ADR 0005): the repeats in a run, sized and paced as the Plan says, found in a run's
 * segments (shape) or typed in a Note. Pure, no I/O.
 */
import type { DetailInterval } from "./details.ts";
import { paceSeconds } from "./plan-view.ts";

export interface Rep {
  n: number;
  time_s: number;
  distance_m: number | null;
  pace_s_per_km: number | null;
  pace: string | null;
  avg_hr_bpm: number | null;
  all_out: boolean;
}

/** How a rep is sized. Exactly one kind per target. */
export type RepSize =
  | { kind: "distance"; distance_m: number }
  | { kind: "duration"; duration_s: number }
  | { kind: "laps"; laps_per_rep: number; lap_m: [number, number] };

export interface ShapeTarget {
  reps: number;
  pace_s_per_km: number;
  size: RepSize;
}

/** 254 → "4:14", 1395 → "23:15". Rounds first. */
export function formatSeconds(s: number): string {
  const whole = Math.round(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Reps found in a run's segments for a target (rules below). [] when none fit. */
export function shapeReps(intervals: DetailInterval[], target: ShapeTarget): Rep[] {
  void intervals;
  void target;
  return [];
}

/** Reps from a Note: "m:ss" times; `allOut` lists 1-based rep numbers; one distance for every rep (null allowed). avg_hr_bpm is null. */
export function noteReps(times: string[], allOut: number[], distanceM: number | null): Rep[] {
  return times.map((t, i) => {
    const n = i + 1;
    const time_s = paceSeconds(t);
    const pace_s_per_km = distanceM === null ? null : Math.round((time_s / distanceM) * 1000);
    return {
      n,
      time_s,
      distance_m: distanceM,
      pace_s_per_km,
      pace: pace_s_per_km === null ? null : formatSeconds(pace_s_per_km),
      avg_hr_bpm: null,
      all_out: allOut.includes(n),
    };
  });
}

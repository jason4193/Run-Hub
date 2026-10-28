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
  const { size } = target;
  const inPace = (s: DetailInterval): boolean =>
    s.distance !== null &&
    s.elapsed_time !== null &&
    s.distance > 0 &&
    s.elapsed_time > 0 &&
    Math.abs((s.elapsed_time / s.distance) * 1000 - target.pace_s_per_km) <= 0.15 * target.pace_s_per_km;

  let groups: DetailInterval[][];
  if (size.kind === "distance") {
    const D = size.distance_m;
    groups = intervals.filter((s) => inPace(s) && s.distance !== null && Math.abs(s.distance - D) <= 0.1 * D).map((s) => [s]);
  } else if (size.kind === "duration") {
    const T = size.duration_s;
    groups = intervals
      .filter((s) => inPace(s) && s.elapsed_time !== null && Math.abs(s.elapsed_time - T) <= 0.1 * T)
      .map((s) => [s]);
  } else {
    const lo = size.laps_per_rep * size.lap_m[0] * 0.9;
    const hi = size.laps_per_rep * size.lap_m[1] * 1.1;
    groups = [];
    let group: DetailInterval[] = [];
    for (const s of intervals) {
      if (!inPace(s)) {
        group = [];
        continue;
      }
      group.push(s);
      const total = group.reduce((a, g) => a + (g.distance ?? 0), 0);
      if (total >= lo && total <= hi) {
        groups.push(group);
        group = [];
      } else if (total > hi) {
        group = [];
      }
    }
  }
  return groups.map((g, i) => repFrom(g, i + 1));
}

/** One rep from the segments it joins: summed time and distance, elapsed-time pace, HR weighted by elapsed time. */
function repFrom(segments: DetailInterval[], n: number): Rep {
  const time_s = segments.reduce((a, s) => a + (s.elapsed_time ?? 0), 0);
  const distance_m = segments.reduce((a, s) => a + (s.distance ?? 0), 0);
  const withHr = segments.filter((s) => s.average_heartrate !== null);
  const hrTime = withHr.reduce((a, s) => a + (s.elapsed_time ?? 0), 0);
  const pace_s_per_km = Math.round((time_s / distance_m) * 1000);
  return {
    n,
    time_s: Math.round(time_s),
    distance_m: Math.round(distance_m),
    pace_s_per_km,
    pace: formatSeconds(pace_s_per_km),
    avg_hr_bpm:
      withHr.length === 0
        ? null
        : Math.round(withHr.reduce((a, s) => a + (s.average_heartrate ?? 0) * (s.elapsed_time ?? 0), 0) / hrTime),
    all_out: false,
  };
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

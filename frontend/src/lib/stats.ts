import type { ActivitiesSnapshot } from "../types/snapshot";

/** Lifetime totals derived entirely from the activities snapshot (docs/DESIGN.md §6). */
export interface LifetimeStats {
  totalDistanceM: number;
  totalRuns: number;
  totalMovingTimeS: number;
  longestRunM: number;
  /** Earliest `startDateLocal` (ISO string) across all runs, or "" if none. */
  runningSince: string;
}

export function computeLifetimeStats(s: ActivitiesSnapshot): LifetimeStats {
  const acts = s.activities;
  let totalDistanceM = 0;
  let totalMovingTimeS = 0;
  let longestRunM = 0;
  let runningSince = "";

  for (const a of acts) {
    totalDistanceM += a.distance;
    totalMovingTimeS += a.movingTime;
    if (a.distance > longestRunM) longestRunM = a.distance;
    if (runningSince === "" || a.startDateLocal < runningSince) {
      runningSince = a.startDateLocal;
    }
  }

  return {
    totalDistanceM,
    totalRuns: acts.length,
    totalMovingTimeS,
    longestRunM,
    runningSince,
  };
}

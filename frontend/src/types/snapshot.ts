// Shared Snapshot contract — the only shape the frontend ever reads.
// The browser never calls intervals.icu; see docs/adr/0001-prefetch-snapshot-over-live-api.md.
// Forward-compatible: `elevation` and `time` are reserved for a future /streams source.

export type LatLng = [number, number]; // [lat, lng], rounded to 5 dp (~1 m)

/** Run-family activity types Run Hub includes (the activities list has no sport filter). */
export const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"] as const;
export type RunType = (typeof RUN_TYPES)[number];

export interface SnapshotActivity {
  id: string;
  name: string;
  type: string; // Run | TrailRun | VirtualRun
  startDateLocal: string; // ISO-8601 from start_date_local
  distance: number; // meters
  movingTime: number; // seconds
  pace: number | null; // seconds per meter (raw API field)
  routeId: number | null;
  latlngs: LatLng[]; // decimated /map path
  bounds?: [LatLng, LatLng]; // optional [SW, NE] from /map
  elevation?: number[]; // RESERVED (future, from /streams)
  time?: number[]; // RESERVED (future, from /streams)
}

export interface ActivitiesSnapshot {
  schemaVersion: 1;
  generatedAt: string; // ISO-8601 UTC
  activities: SnapshotActivity[]; // sorted desc by startDateLocal
}

export interface BestEffort {
  distance: number; // meters (e.g. 400, 1000, 1609, 5000, 10000, 21100)
  label: string; // "400 m" | "1 km" | "1 mile" | "5 km" | "10 km" | "Half"
  timeSeconds: number; // best time to cover the distance
  paceSecPerKm: number; // derived: timeSeconds / (distance / 1000)
  activityId: string | null; // run that set the PB
  date: string | null; // start_date_local of that run
}

export interface PaceCurveSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  pace: BestEffort[]; // type=PACE
  gap: BestEffort[]; // type=GAP (grade-adjusted); empty array if skipped/unavailable
}

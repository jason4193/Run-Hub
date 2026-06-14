import type { ActivitiesSnapshot, SnapshotActivity, LatLng } from "../types/snapshot";

/** A deck.gl-ready trip. Coordinates are [lng, lat] (deck.gl order). */
export interface TripPath {
  /** [lng, lat] vertices (snapshot stores [lat, lng] — order is flipped here). */
  path: [number, number][];
  /**
   * Per-vertex times in the same unit as the animation clock's `currentTime`.
   * A comet sweeps the route from the first timestamp to the last; v1 derives the
   * *relative* spacing from synthesized pacing (cumulative segment distance) and
   * the absolute scale from the loop length. A per-route phase (baked in) desyncs
   * the comets so they read as continuous traffic (docs/DESIGN.md §3.3).
   */
  timestamps: number[];
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two [lat, lng] points, in metres. */
function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Simple deterministic 32-bit FNV-1a hash → non-negative integer. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    // FNV prime multiply, kept in 32-bit range.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Normalised 0..1 timeline along the route (real time if present, else by distance). */
function routeFractions(a: SnapshotActivity): number[] {
  const pts = a.latlngs;
  const uniform = (): number[] => pts.map((_, i) => i / (pts.length - 1));

  // FUTURE (docs/DESIGN.md §3.6): real per-point time via /streams drives true pacing.
  const realTime = a.time;
  if (realTime && realTime.length === pts.length) {
    const t0 = realTime[0];
    const span = realTime[realTime.length - 1] - t0;
    return span > 0 ? realTime.map((t) => (t - t0) / span) : uniform();
  }

  // Synthesize from cumulative haversine distance.
  const cum: number[] = new Array(pts.length);
  cum[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + haversine(pts[i - 1], pts[i]);
  }
  const total = cum[cum.length - 1];
  return total > 0 ? cum.map((d) => d / total) : uniform();
}

/**
 * Build deck.gl trips for one activity. The comet traverses the whole route once
 * per loop; a deterministic phase desyncs routes. We emit TWO copies — this loop
 * and the previous loop (timestamps − loopMs) — so the comet wraps seamlessly
 * across the loop boundary and on-screen density stays uniform (no global
 * blackout / reload between cycles).
 */
function buildOne(a: SnapshotActivity, loopMs: number): TripPath[] {
  const pts = a.latlngs;
  if (pts.length < 2) return [];

  const path: [number, number][] = pts.map(([lat, lng]) => [lng, lat]);
  const fractions = routeFractions(a);
  const phase = hashId(a.id) % loopMs;

  const thisLoop = fractions.map((f) => f * loopMs + phase);
  const prevLoop = thisLoop.map((t) => t - loopMs);

  return [
    { path, timestamps: thisLoop },
    { path, timestamps: prevLoop },
  ];
}

/** Build deck.gl trips for every activity that has a usable path. */
export function buildTrips(s: ActivitiesSnapshot, loopMs: number): TripPath[] {
  const trips: TripPath[] = [];
  for (const a of s.activities) {
    trips.push(...buildOne(a, loopMs));
  }
  return trips;
}

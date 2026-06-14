/**
 * Build the Snapshot from the intervals.icu API.
 *
 * Contract (see plan.md §4): list-full, map-incremental, never write a partial Snapshot.
 *   - Fetch the full activity list every run (one slim request) → catches backfilled past runs.
 *   - Diff by activity id; only call the expensive /map endpoint for runs not already stored.
 *   - Write atomically (temp file then rename); on failure, preserve the last good Snapshot.
 *
 * The browser never runs this. The API key lives only in the build env.
 *
 * Run: npm run fetch   (npx tsx scripts/fetch-snapshot.ts)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---- Types (kept in sync with frontend/src/types/snapshot.ts) -----------------------
type LatLng = [number, number];

interface SnapshotActivity {
  id: string;
  name: string;
  type: string;
  startDateLocal: string;
  distance: number;
  movingTime: number;
  pace: number | null;
  routeId: number | null;
  latlngs: LatLng[];
  bounds?: [LatLng, LatLng];
  elevation?: number[];
  time?: number[];
}

interface ActivitiesSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  activities: SnapshotActivity[];
}

interface BestEffort {
  distance: number;
  label: string;
  timeSeconds: number;
  paceSecPerKm: number;
  activityId: string | null;
  date: string | null;
}

interface PaceCurveSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  pace: BestEffort[];
  gap: BestEffort[];
}

// ---- Config ----------------------------------------------------------------
const API_BASE = "https://intervals.icu";
const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
const LIST_FIELDS = "id,name,type,start_date_local,distance,moving_time,pace,route_id";
const MAP_CONCURRENCY = 3;
const BACKFILL_OLDEST = "2000-01-01";

const TARGET_DISTANCES: { distance: number; label: string }[] = [
  { distance: 400, label: "400 m" },
  { distance: 1000, label: "1 km" },
  { distance: 1609, label: "1 mile" },
  { distance: 5000, label: "5 km" },
  { distance: 10000, label: "10 km" },
  { distance: 21100, label: "Half" },
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");
const PACE_FILE = path.join(DATA_DIR, "pace-curve.json");

// ---- Env -------------------------------------------------------------------
// Load .env if present (local runs). In CI the vars come from the real environment.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* no .env — rely on process.env (CI) */
}

const API_KEY = process.env.INTERVALS_API_KEY;
const ATHLETE_ID = process.env.INTERVALS_ATHLETE_ID ?? "0";
if (!API_KEY) {
  console.error("Missing INTERVALS_API_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(`API_KEY:${API_KEY}`).toString("base64");

// ---- HTTP helper with 429 backoff ------------------------------------------
async function apiGet(pathAndQuery: string, attempt = 0): Promise<Response> {
  const res = await fetch(`${API_BASE}${pathAndQuery}`, {
    headers: { Authorization: AUTH, Accept: "application/json" },
  });
  if (res.status === 429 && attempt < 5) {
    const waitMs = 1000 * 2 ** attempt;
    console.warn(`429 rate-limited; retrying in ${waitMs}ms…`);
    await sleep(waitMs);
    return apiGet(pathAndQuery, attempt + 1);
  }
  return res;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const today = () => new Date().toISOString().slice(0, 10);

// ---- Steps -----------------------------------------------------------------
async function readPriorSnapshot(): Promise<Map<string, SnapshotActivity>> {
  try {
    const raw = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const snap = JSON.parse(raw) as ActivitiesSnapshot;
    return new Map(snap.activities.map((a) => [a.id, a]));
  } catch {
    return new Map(); // first run / initial backfill
  }
}

interface RawActivity {
  id: string;
  name?: string;
  type?: string;
  start_date_local?: string;
  distance?: number;
  moving_time?: number;
  pace?: number | null;
  route_id?: number | null;
}

async function fetchActivityList(): Promise<RawActivity[]> {
  const q = `/api/v1/athlete/${ATHLETE_ID}/activities?oldest=${BACKFILL_OLDEST}&newest=${today()}&fields=${encodeURIComponent(LIST_FIELDS)}`;
  const res = await apiGet(q);
  if (!res.ok) throw new Error(`activity list ${res.status}: ${await res.text()}`);
  const all = (await res.json()) as RawActivity[];
  return all.filter((a) => a.type != null && RUN_TYPES.has(a.type));
}

interface MapData {
  latlngs?: number[][];
  bounds?: number[][];
}

/** Fetch the decimated /map path for one activity. Returns null on any failure (skip + retry next run). */
async function fetchMap(id: string): Promise<Pick<SnapshotActivity, "latlngs" | "bounds"> | null> {
  try {
    const res = await apiGet(`/api/v1/activity/${id}/map`);
    if (!res.ok) {
      console.warn(`  map ${id}: ${res.status}, skipping`);
      return null;
    }
    const data = (await res.json()) as MapData;
    if (!Array.isArray(data.latlngs) || data.latlngs.length === 0) {
      console.warn(`  map ${id}: no latlngs, skipping`);
      return null;
    }
    const latlngs: LatLng[] = data.latlngs
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [round5(p[0]), round5(p[1])]);
    let bounds: [LatLng, LatLng] | undefined;
    if (Array.isArray(data.bounds) && data.bounds.length >= 2) {
      bounds = [
        [round5(data.bounds[0][0]), round5(data.bounds[0][1])],
        [round5(data.bounds[1][0]), round5(data.bounds[1][1])],
      ];
    }
    return { latlngs, bounds };
  } catch (e) {
    console.warn(`  map ${id}: ${(e as Error).message}, skipping`);
    return null;
  }
}

function toSnapshotActivity(raw: RawActivity, map: Pick<SnapshotActivity, "latlngs" | "bounds">): SnapshotActivity {
  return {
    id: raw.id,
    name: raw.name ?? "",
    type: raw.type ?? "",
    startDateLocal: raw.start_date_local ?? "",
    distance: raw.distance ?? 0,
    movingTime: raw.moving_time ?? 0,
    pace: raw.pace ?? null,
    routeId: raw.route_id ?? null,
    latlngs: map.latlngs,
    bounds: map.bounds,
  };
}

/** Run an async mapper over items with a small concurrency limit. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---- Pace curve ------------------------------------------------------------
interface PaceCurve {
  distance?: number[];
  values?: number[]; // seconds — see plan.md §8(2): verify units against a live payload
  activity_id?: (string | null)[];
  start_date_local?: string;
}
interface DataCurveSet {
  list?: PaceCurve[];
}

// A target only counts if the curve actually reaches that distance. The curve's
// `values[]` are cumulative seconds for `distance[]` meters (verified against live
// data); pace is computed from the ACTUAL matched distance, never the target —
// otherwise distances the athlete hasn't run get a fake-fast pace (e.g. a 15 km
// best mislabelled as a Half). Tolerance: target must be within 5% of a real point.
const DISTANCE_TOLERANCE = 0.05;

function bestEffortsFromCurve(
  curve: PaceCurve | undefined,
  dateById: Map<string, string>,
): BestEffort[] {
  if (!curve?.distance || !curve.values) return [];
  const dist = curve.distance;
  const vals = curve.values;
  const acts = curve.activity_id ?? [];
  const efforts: BestEffort[] = [];
  for (const { distance, label } of TARGET_DISTANCES) {
    // nearest available curve point to the target distance
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < dist.length; i++) {
      const d = Math.abs(dist[i] - distance);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    // skip targets the athlete hasn't actually run (curve doesn't reach them)
    if (bi < 0 || bd / distance > DISTANCE_TOLERANCE) continue;
    const timeSeconds = vals[bi] ?? 0;
    if (timeSeconds <= 0) continue;
    const actualDistance = dist[bi];
    const activityId = acts[bi] ?? null;
    efforts.push({
      distance,
      label,
      timeSeconds,
      paceSecPerKm: timeSeconds / (actualDistance / 1000),
      activityId,
      date: (activityId && dateById.get(activityId)) ?? null, // real PB date, not window start
    });
  }
  return efforts;
}

async function fetchPaceCurves(dateById: Map<string, string>): Promise<PaceCurveSnapshot> {
  // ⚠️ plan.md §8(1): `curves` defaults to "last year". For true all-time bests this
  // window likely needs adjusting once verified against a live payload.
  const base = `/api/v1/athlete/${ATHLETE_ID}/pace-curves.json?type=Run&newest=${today()}`;
  const empty: PaceCurveSnapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    pace: [],
    gap: [],
  };
  try {
    const [paceRes, gapRes] = await Promise.all([apiGet(base), apiGet(`${base}&gap=true`)]);
    const pace = paceRes.ok ? ((await paceRes.json()) as DataCurveSet).list?.[0] : undefined;
    const gap = gapRes.ok ? ((await gapRes.json()) as DataCurveSet).list?.[0] : undefined;
    return {
      ...empty,
      pace: bestEffortsFromCurve(pace, dateById),
      gap: bestEffortsFromCurve(gap, dateById),
    };
  } catch (e) {
    console.warn(`pace-curves failed (${(e as Error).message}); writing empty pace snapshot.`);
    return empty;
  }
}

// ---- Atomic write ----------------------------------------------------------
async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

// ---- Main ------------------------------------------------------------------
async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const prior = await readPriorSnapshot();
  const list = await fetchActivityList();
  const listedIds = new Set(list.map((a) => a.id));
  console.log(`Activity list: ${list.length} runs; ${prior.size} already stored.`);

  const newRaws = list.filter((a) => !prior.has(a.id));
  console.log(`Fetching maps for ${newRaws.length} new run(s)…`);

  const built = await mapPool(newRaws, MAP_CONCURRENCY, async (raw) => {
    const map = await fetchMap(raw.id);
    return map ? toSnapshotActivity(raw, map) : null;
  });

  // Merge: keep prior entries that still exist, add newly built ones, drop deleted.
  const merged = new Map<string, SnapshotActivity>();
  for (const a of prior.values()) if (listedIds.has(a.id)) merged.set(a.id, a);
  for (const a of built) if (a) merged.set(a.id, a);

  const activities = [...merged.values()].sort((a, b) =>
    b.startDateLocal.localeCompare(a.startDateLocal),
  );

  const activitiesSnapshot: ActivitiesSnapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    activities,
  };

  // Resolve each PB to the date of the activity that set it (curve carries the id).
  const dateById = new Map<string, string>(
    list.filter((a) => a.start_date_local).map((a) => [a.id, a.start_date_local as string]),
  );
  const paceSnapshot = await fetchPaceCurves(dateById);

  await writeJsonAtomic(ACTIVITIES_FILE, activitiesSnapshot);
  await writeJsonAtomic(PACE_FILE, paceSnapshot);

  const skipped = newRaws.length - built.filter(Boolean).length;
  console.log(
    `Wrote ${activities.length} activities (${built.filter(Boolean).length} new, ${skipped} skipped) ` +
      `and ${paceSnapshot.pace.length} pace efforts.`,
  );
}

main().catch((e) => {
  // Unhandled error after building → exit non-zero WITHOUT writing (preserve last good Snapshot).
  console.error("Snapshot build failed:", e);
  process.exit(1);
});

import type { ActivitiesSnapshot, PaceCurveSnapshot } from "../types/snapshot";

// Host-agnostic. Reads the static JSON the build served; never calls intervals.icu.
// BASE_URL respects the Vite `base` (e.g. /Run-Hub/ on GitHub Pages project pages).
const BASE = import.meta.env.BASE_URL;

export async function loadActivities(): Promise<ActivitiesSnapshot> {
  const res = await fetch(`${BASE}data/activities.json`);
  if (!res.ok) throw new Error(`activities.json ${res.status}`);
  return res.json();
}

export async function loadPaceCurve(): Promise<PaceCurveSnapshot> {
  const res = await fetch(`${BASE}data/pace-curve.json`);
  if (!res.ok) throw new Error(`pace-curve.json ${res.status}`);
  return res.json();
}

import { useEffect, useState } from "react";
import { loadActivities, loadPaceCurve } from "./lib/loadSnapshot";
import type { ActivitiesSnapshot, PaceCurveSnapshot } from "./types/snapshot";

// Minimal data-contract proof. Visual design (Hero, Heatmap, popover) lives in docs/DESIGN.md.
export default function App() {
  const [activities, setActivities] = useState<ActivitiesSnapshot | null>(null);
  const [paceCurve, setPaceCurve] = useState<PaceCurveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadActivities(), loadPaceCurve()])
      .then(([a, p]) => {
        setActivities(a);
        setPaceCurve(p);
        console.log(`Loaded ${a.activities.length} activities, generated ${a.generatedAt}`);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <main style={wrap}>Failed to load snapshot: {error}</main>;
  if (!activities || !paceCurve) return <main style={wrap}>Loading…</main>;

  return (
    <main style={wrap}>
      <h1 style={{ margin: 0, fontWeight: 300 }}>Run Hub</h1>
      <p style={{ opacity: 0.6 }}>
        Snapshot · {activities.activities.length} runs · generated{" "}
        {new Date(activities.generatedAt).toLocaleString()}
      </p>

      <h2 style={{ fontWeight: 400 }}>All-time best efforts (pace)</h2>
      <ul>
        {paceCurve.pace.length === 0 && <li style={{ opacity: 0.6 }}>No pace data yet.</li>}
        {paceCurve.pace.map((e) => (
          <li key={e.distance}>
            <strong>{e.label}</strong> — {formatPace(e.paceSecPerKm)} /km
            {e.date ? ` (${e.date.slice(0, 10)})` : ""}
          </li>
        ))}
      </ul>

      <p style={{ opacity: 0.5, fontSize: 13 }}>
        Heatmap and best-efforts popover are implemented next per docs/DESIGN.md.
      </p>
    </main>
  );
}

function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const wrap: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "3rem 1.5rem",
  lineHeight: 1.6,
};

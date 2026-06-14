import { useEffect, useMemo, useRef, useState } from "react";
import type { MapViewState } from "@deck.gl/core";
import { loadActivities, loadPaceCurve } from "./lib/loadSnapshot";
import type { ActivitiesSnapshot, PaceCurveSnapshot } from "./types/snapshot";
import { buildTrips } from "./lib/trips";
import { cameraKeyframes, initialViewState } from "./lib/bounds";
import { computeLifetimeStats } from "./lib/stats";
import { LOOP_MS } from "./map/constants";
import { useClock } from "./anim/clock";
import { useAmbientLoop } from "./anim/useAmbientLoop";
import MapCanvas from "./map/MapCanvas";
import Hero from "./ui/Hero";
import MapSection from "./ui/MapSection";
import ControlPanel from "./ui/ControlPanel";
import Footer from "./ui/Footer";
import "./styles/app.css";

/**
 * Run Hub. Loads the static snapshot, then composes Hero → Map → Footer over a
 * single shared map backdrop whose camera + comet clock are driven by scroll
 * (docs/DESIGN.md). No API calls; reads only the prefetched JSON (ADR 0001).
 */
export default function App() {
  const [activities, setActivities] = useState<ActivitiesSnapshot | null>(null);
  const [paceCurve, setPaceCurve] = useState<PaceCurveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [viewState, setViewState] = useState<MapViewState | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [pinned, setPinned] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const exploreRef = useRef<HTMLElement>(null);

  // Shared animation clock. Ambient rAF drives it except while the map is pinned.
  const currentTime = useClock();
  useAmbientLoop(!pinned);

  useEffect(() => {
    Promise.all([loadActivities(), loadPaceCurve()])
      .then(([a, p]) => {
        setActivities(a);
        setPaceCurve(p);
        setViewState(initialViewState(a));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const trips = useMemo(
    () => (activities ? buildTrips(activities, LOOP_MS) : []),
    [activities],
  );
  const keyframes = useMemo(
    () => (activities ? cameraKeyframes(activities) : []),
    [activities],
  );
  const stats = useMemo(
    () => (activities ? computeLifetimeStats(activities) : null),
    [activities],
  );

  if (error) {
    return <main className="status-screen">Failed to load snapshot: {error}</main>;
  }
  if (!activities || !paceCurve || !stats || !viewState) {
    return <main className="status-screen">Loading…</main>;
  }

  return (
    <div className="app" data-interactive={interactive}>
      {/* The map only accepts pointer input once it unlocks (post-scrub). */}
      <div
        className="map-backdrop"
        style={{ pointerEvents: interactive ? "auto" : "none" }}
      >
        <MapCanvas
          viewState={viewState}
          currentTime={currentTime}
          trips={trips}
          interactive={interactive}
          onViewStateChange={setViewState}
        />
      </div>

      {/* Cinematic scrim + vignette + film grain over the map for depth & legibility. */}
      <div className="atmosphere" aria-hidden="true" />

      <Hero
        name="Jason"
        sinceYear={
          stats.runningSince ? new Date(stats.runningSince).getFullYear() : null
        }
      />

      <MapSection
        sectionRef={sectionRef}
        interactiveRef={exploreRef}
        keyframes={keyframes}
        setViewState={setViewState}
        setInteractive={setInteractive}
        setPinned={setPinned}
        runCount={activities.activities.length}
        totalDistanceM={stats.totalDistanceM}
      />

      {/* Interactive viewport: a transparent full-height pane the (now unlocked)
          fixed map shows through, so the user can pan / zoom / tilt over Sydney. */}
      <section className="map-explore" aria-label="Explore the map" ref={exploreRef}>
        {interactive && (
          <ControlPanel paceEfforts={paceCurve.pace} stats={stats} />
        )}
      </section>

      <Footer generatedAt={activities.generatedAt} />
    </div>
  );
}

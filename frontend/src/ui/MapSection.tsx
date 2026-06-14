import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { MapViewState } from "@deck.gl/core";
import type { ViewStateKeyframe } from "../lib/bounds";
import { useMapScrollScene } from "../anim/useMapScrollScene";
import { prefersReducedMotion } from "../anim/reducedMotion";
import { formatDistanceKm } from "../lib/format";

export interface MapSectionProps {
  sectionRef: RefObject<HTMLElement | null>;
  /** The explore viewport that gates when the map unlocks. */
  interactiveRef: RefObject<HTMLElement | null>;
  keyframes: ViewStateKeyframe[];
  setViewState: (vs: MapViewState) => void;
  setInteractive: (interactive: boolean) => void;
  setPinned: (pinned: boolean) => void;
  /** Reveal the persistent stats toggle once the map section is reached. */
  setStatsReady: (ready: boolean) => void;
  runCount: number;
  totalDistanceM: number;
}

/**
 * The pinned scroll scene wrapper (docs/DESIGN.md §2.2). Hosts the scroll
 * orchestration and the captions that reveal in sync with the scrub. The map
 * itself is a shared fixed backdrop rendered in App.
 */
export default function MapSection({
  sectionRef,
  interactiveRef,
  keyframes,
  setViewState,
  setInteractive,
  setPinned,
  setStatsReady,
  runCount,
  totalDistanceM,
}: MapSectionProps) {
  const capsRef = useRef<HTMLDivElement>(null);

  const onProgress = useCallback((p: number): void => {
    const caps = capsRef.current?.querySelectorAll<HTMLElement>("[data-caption]");
    if (!caps) return;
    const n = caps.length;
    caps.forEach((cap, i) => {
      // Staggered reveal (rise + fade in), in reading order.
      const start = i / n;
      const reveal = Math.min(1, Math.max(0, (p - start) * n * 1.5));
      // Staggered exit over the tail of the scrub — each line dissolves and
      // lifts away one at a time (rather than the whole block at once), so the
      // captions settle in place instead of riding the full screen height up.
      const exitStart = 0.78 + (i / n) * 0.13;
      const exit = Math.min(1, Math.max(0, (p - exitStart) / 0.09));
      cap.style.opacity = String(reveal * (1 - exit));
      cap.style.transform = `translateY(${((1 - reveal) * 12 - exit * 10).toFixed(1)}px)`;
    });
  }, []);

  useMapScrollScene({
    sectionRef,
    interactiveRef,
    keyframes,
    setViewState,
    setInteractive,
    setPinned,
    setStatsReady,
    onProgress,
  });

  // Reduced motion: there's no scrub to drive reveals, so show captions outright.
  useEffect(() => {
    if (!prefersReducedMotion()) return;
    const caps = capsRef.current?.querySelectorAll<HTMLElement>("[data-caption]");
    caps?.forEach((cap) => {
      cap.style.opacity = "1";
      cap.style.transform = "none";
    });
  }, []);

  return (
    <section className="map-section" ref={sectionRef}>
      <div className="map-captions" ref={capsRef}>
        <p className="map-caption" data-caption>
          <strong>{runCount}</strong> runs
        </p>
        <p className="map-caption" data-caption>
          over <strong>Sydney</strong>
        </p>
        <p className="map-caption" data-caption>
          <strong>{formatDistanceKm(totalDistanceM)}</strong> on the streets
        </p>
      </div>
    </section>
  );
}

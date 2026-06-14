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
  runCount,
  totalDistanceM,
}: MapSectionProps) {
  const capsRef = useRef<HTMLDivElement>(null);

  const onProgress = useCallback((p: number): void => {
    const caps = capsRef.current?.querySelectorAll<HTMLElement>("[data-caption]");
    if (!caps) return;
    caps.forEach((cap, i) => {
      const start = i / caps.length;
      const local = Math.min(1, Math.max(0, (p - start) * caps.length * 1.5));
      cap.style.opacity = String(local);
      cap.style.transform = `translateY(${((1 - local) * 12).toFixed(1)}px)`;
    });
  }, []);

  useMapScrollScene({
    sectionRef,
    interactiveRef,
    keyframes,
    setViewState,
    setInteractive,
    setPinned,
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

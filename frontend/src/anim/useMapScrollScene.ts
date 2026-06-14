import { useEffect } from "react";
import type { RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MapViewState } from "@deck.gl/core";
import type { ViewStateKeyframe } from "../lib/bounds";
import { LOOP_MS, setCurrentTime } from "./clock";
import { prefersReducedMotion } from "./reducedMotion";

gsap.registerPlugin(ScrollTrigger);

export interface MapScrollSceneOptions {
  /** The section element to pin while scrubbing. */
  sectionRef: RefObject<HTMLElement | null>;
  /**
   * The interactive viewport (the explore section after the scrub). The map only
   * unlocks once this fully fills the viewport — i.e. the captions have scrolled
   * away — so interaction never starts mid-caption.
   */
  interactiveRef: RefObject<HTMLElement | null>;
  /** Scripted camera poses the scrub interpolates between. */
  keyframes: ViewStateKeyframe[];
  /** Push an interpolated camera pose. */
  setViewState: (vs: MapViewState) => void;
  /** Enable/disable free camera control. */
  setInteractive: (interactive: boolean) => void;
  /** True while the section is pinned (so the ambient loop pauses). */
  setPinned: (pinned: boolean) => void;
  /**
   * Latched true once the map section is reached and held until the user
   * scrolls back up to the hero — gates the persistent stats toggle so it's
   * discoverable from the map section onward (not just in the explore zone).
   */
  setStatsReady?: (ready: boolean) => void;
  /** Scrub progress 0..1, for caption reveals. */
  onProgress?: (progress: number) => void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sample the keyframe path at t∈[0,1] (linear across equal-length segments). */
function sampleKeyframes(frames: ViewStateKeyframe[], t: number): MapViewState {
  if (frames.length === 1) return { ...frames[0] };
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (frames.length - 1);
  const i = Math.min(frames.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = frames[i];
  const b = frames[i + 1];
  return {
    longitude: lerp(a.longitude, b.longitude, f),
    latitude: lerp(a.latitude, b.latitude, f),
    zoom: lerp(a.zoom, b.zoom, f),
    pitch: lerp(a.pitch, b.pitch, f),
    bearing: lerp(a.bearing, b.bearing, f),
  };
}

/**
 * The pinned scroll scene (docs/DESIGN.md §3.4–3.5). While pinned, scroll
 * progress scrubs BOTH the animation clock and the camera; on release the map
 * unlocks to free interaction. Honors prefers-reduced-motion (no scrub/pin).
 */
export function useMapScrollScene(opts: MapScrollSceneOptions): void {
  const {
    sectionRef,
    interactiveRef,
    keyframes,
    setViewState,
    setInteractive,
    setPinned,
    setStatsReady,
    onProgress,
  } = opts;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      // Static: no pin/scrub. Hold a pleasant mid frame and keep the map usable.
      setViewState(sampleKeyframes(keyframes, 0.5));
      setInteractive(true);
      setPinned(false);
      setStatsReady?.(true);
      return;
    }

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      // Longer pin so a fast flick can't skip the whole reveal in one go.
      end: "+=3200",
      pin: true,
      // Numeric scrub = catch-up smoothing: the camera/clock ease toward scroll
      // position over ~1.2s instead of snapping, so fast scrolls don't jolt.
      scrub: 1.2,
      onUpdate: (self) => {
        const p = self.progress;
        setCurrentTime(p * LOOP_MS);
        setViewState(sampleKeyframes(keyframes, p));
        onProgress?.(p);
      },
      onEnter: () => {
        setPinned(true);
        setInteractive(false);
        setStatsReady?.(true);
      },
      onEnterBack: () => {
        setPinned(true);
        setInteractive(false);
        setStatsReady?.(true);
      },
      // Scrub finished: stop pinning so the ambient loop resumes. Interactivity is
      // handled separately (below) so it doesn't start while captions still show.
      onLeave: () => {
        setPinned(false);
      },
      // Scrolled back up to the hero → ambient resumes, camera stays scripted,
      // and the stats toggle hides again (it belongs to the map onward).
      onLeaveBack: () => {
        setPinned(false);
        setInteractive(false);
        setStatsReady?.(false);
      },
    });

    // Unlock free pan/zoom/tilt only once the explore viewport fully fills the
    // screen (the captions have scrolled past); re-lock when scrolling back up.
    const interactiveEl = interactiveRef.current;
    const interactiveTrigger = interactiveEl
      ? ScrollTrigger.create({
          trigger: interactiveEl,
          start: "top top",
          onEnter: () => setInteractive(true),
          onLeaveBack: () => setInteractive(false),
        })
      : null;

    return () => {
      trigger.kill();
      interactiveTrigger?.kill();
    };
  }, [
    sectionRef,
    interactiveRef,
    keyframes,
    setViewState,
    setInteractive,
    setPinned,
    setStatsReady,
    onProgress,
  ]);
}

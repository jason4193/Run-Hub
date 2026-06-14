import { useEffect } from "react";
import { getCurrentTime, setCurrentTime } from "./clock";

/**
 * requestAnimationFrame loop that advances the shared clock while `enabled` is
 * true — the resting-state driver (hero, and after the scroll scrub releases).
 * Suspended whenever the map section is pinned (docs/DESIGN.md §3.4).
 */
export function useAmbientLoop(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = now - last;
      last = now;
      setCurrentTime(getCurrentTime() + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}

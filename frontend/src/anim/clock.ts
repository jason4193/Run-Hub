import { useSyncExternalStore } from "react";
import { LOOP_MS } from "../map/constants";

// One shared animation clock (docs/DESIGN.md §3.4). Two drivers write to it:
// the ambient rAF loop (resting state) and the scroll scrub (pinned state).
// Components read it via `useClock()`.

let currentTime = 0;
const listeners = new Set<() => void>();

export function getCurrentTime(): number {
  return currentTime;
}

/** Set the clock, wrapped into [0, LOOP_MS). Notifies subscribers on change. */
export function setCurrentTime(t: number): void {
  const wrapped = ((t % LOOP_MS) + LOOP_MS) % LOOP_MS;
  if (wrapped === currentTime) return;
  currentTime = wrapped;
  for (const notify of listeners) notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe a component to the clock; re-renders each tick while mounted. */
export function useClock(): number {
  return useSyncExternalStore(subscribe, getCurrentTime, getCurrentTime);
}

export { LOOP_MS };

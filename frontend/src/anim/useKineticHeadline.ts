import { useEffect } from "react";
import type { RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "./reducedMotion";

gsap.registerPlugin(ScrollTrigger);

// Rest vs. peak variable-font axes (docs/DESIGN.md §4.1). Rest already sits wide &
// bold (the look the user liked from the mid-scroll state); velocity nudges it to
// the maxima + adds the forward lean.
const REST_WDTH = 118;
const REST_WGHT = 800;
const PEAK_WDTH = 125;
const PEAK_WGHT = 880;
const PEAK_SKEW = 12; // forward lean (deg)
const VELOCITY_FULL = 2500; // px/s mapped to full stretch

// Cursor proximity (magnetic) reaction.
const POINTER_RADIUS = 240; // px influence radius around each letter
const POINTER_STRENGTH = 0.32; // how far letters lean toward the cursor
const ENTRANCE_MS = 1300; // let the CSS load reveal finish before we take over

interface Letter {
  el: HTMLElement;
  state: { wdth: number; wght: number; skew: number; x: number; y: number };
  center: { x: number; y: number };
  setWdth: (v: number) => void;
  setWght: (v: number) => void;
  setSkew: (v: number) => void;
  setX: (v: number) => void;
  setY: (v: number) => void;
}

/**
 * Velocity- AND cursor-reactive headline. Each letter (`[data-letter]` inside the
 * container) leans toward the cursor when it's nearby, and on scroll expands its
 * width/weight + forward lean, easing back to rest. All axes/transforms run
 * through gsap `quickTo` setters on a per-letter state object, composited once per
 * frame — so the two effects never overwrite each other. Disabled under
 * prefers-reduced-motion (the static CSS rest state remains).
 */
export function useKineticHeadline(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion()) return;

    const els = gsap.utils.toArray<HTMLElement>("[data-letter]", container);
    if (els.length === 0) return;

    const letters: Letter[] = els.map((el) => {
      const state = { wdth: REST_WDTH, wght: REST_WGHT, skew: 0, x: 0, y: 0 };
      const ease = { duration: 0.5, ease: "power3.out" } as const;
      const pos = { duration: 0.6, ease: "power3.out" } as const;
      return {
        el,
        state,
        center: { x: 0, y: 0 },
        setWdth: gsap.quickTo(state, "wdth", ease),
        setWght: gsap.quickTo(state, "wght", ease),
        setSkew: gsap.quickTo(state, "skew", ease),
        setX: gsap.quickTo(state, "x", pos),
        setY: gsap.quickTo(state, "y", pos),
      };
    });

    // Cache each letter's untransformed centre (viewport coords).
    const measure = (): void => {
      for (const l of letters) {
        const r = l.el.getBoundingClientRect();
        l.center.x = r.left + r.width / 2 - l.state.x;
        l.center.y = r.top + r.height / 2 - l.state.y;
      }
    };
    window.addEventListener("resize", measure);

    const render = (): void => {
      for (const l of letters) {
        const s = l.state;
        l.el.style.fontVariationSettings = `"wdth" ${s.wdth.toFixed(1)}, "wght" ${s.wght.toFixed(0)}`;
        l.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) skewX(${(-s.skew).toFixed(2)}deg)`;
      }
    };

    // Take over rendering only after the CSS entrance has played.
    let tickerOn = false;
    const startTicker = window.setTimeout(() => {
      measure();
      gsap.ticker.add(render);
      tickerOn = true;
    }, ENTRANCE_MS);

    // Cursor proximity → per-letter magnetic lean toward the pointer.
    const onPointer = (e: PointerEvent): void => {
      for (const l of letters) {
        const dx = e.clientX - l.center.x;
        const dy = e.clientY - l.center.y;
        const dist = Math.hypot(dx, dy);
        if (dist < POINTER_RADIUS) {
          const f = 1 - dist / POINTER_RADIUS;
          l.setX(dx * f * POINTER_STRENGTH);
          l.setY(dy * f * POINTER_STRENGTH);
        } else {
          l.setX(0);
          l.setY(0);
        }
      }
    };
    window.addEventListener("pointermove", onPointer);

    // Scroll velocity → width / weight / forward lean.
    const trigger = ScrollTrigger.create({
      trigger: document.body,
      start: 0,
      end: "max",
      onUpdate: (self) => {
        const v = self.getVelocity();
        if (Math.abs(v) < 60) {
          for (const l of letters) {
            l.setWdth(REST_WDTH);
            l.setWght(REST_WGHT);
            l.setSkew(0);
          }
          return;
        }
        const intensity = Math.min(1, Math.abs(v) / VELOCITY_FULL);
        const dir = v >= 0 ? 1 : -1;
        const wdth = REST_WDTH + (PEAK_WDTH - REST_WDTH) * intensity;
        const wght = REST_WGHT + (PEAK_WGHT - REST_WGHT) * intensity;
        const skew = PEAK_SKEW * intensity * dir;
        for (const l of letters) {
          l.setWdth(wdth);
          l.setWght(wght);
          l.setSkew(skew);
        }
      },
    });

    return () => {
      clearTimeout(startTicker);
      if (tickerOn) gsap.ticker.remove(render);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", measure);
      trigger.kill();
      for (const l of letters) gsap.killTweensOf(l.state);
    };
  }, [containerRef]);
}

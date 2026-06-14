import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "./reducedMotion";

gsap.registerPlugin(ScrollTrigger);

/**
 * Count a number up from 0 to `target` when it first scrolls into view, with a
 * brief weight pulse on settle (docs/DESIGN.md §4.1). Under prefers-reduced-motion
 * the final value renders immediately. Attach the returned ref to a text element.
 *
 * `format` must be stable across renders (declare it module-level) — it's an
 * effect dependency, so a fresh function each render would restart the count.
 */
export function useCountUp(
  target: number,
  format: (value: number) => string,
): React.RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.textContent = format(target);
      return;
    }

    const counter = { value: 0 };
    el.textContent = format(0);

    const tween = gsap.to(counter, {
      value: target,
      duration: 1.4,
      ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
      onUpdate: () => {
        el.textContent = format(counter.value);
      },
      onComplete: () => {
        el.textContent = format(target);
        gsap.fromTo(
          el,
          { fontWeight: 600 },
          { fontWeight: 800, duration: 0.18, yoyo: true, repeat: 1 },
        );
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [target, format]);

  return ref;
}

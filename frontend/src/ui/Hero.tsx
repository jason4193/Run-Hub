import { useRef } from "react";
import { useKineticHeadline } from "../anim/useKineticHeadline";

export interface HeroProps {
  /** The athlete's display name. */
  name: string;
  /** Year of the earliest run ("running since"), or null if unknown. */
  sinceYear: number | null;
}

/** Split a word into per-letter spans the kinetic hook can animate. */
function Letters({ text, offset = 0 }: { text: string; offset?: number }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          data-letter
          className="hero__letter"
          // Staggered load reveal (CSS keyframe `letter-rise`); kinetic hook
          // takes over the inline transform once it fires.
          style={{ animationDelay: `${(offset + i) * 0.05}s` }}
        >
          {ch}
        </span>
      ))}
    </>
  );
}

/**
 * Full-bleed hero (docs/DESIGN.md §2). The map runs ambiently behind it (rendered
 * as a fixed backdrop in App). The title sits just above centre and reacts to both
 * scroll velocity and cursor proximity; the athlete name + "since" year sit below.
 */
export default function Hero({ name, sinceYear }: HeroProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useKineticHeadline(titleRef);

  return (
    <section className="hero">
      <h1 className="hero__title" ref={titleRef}>
        <Letters text="RUN" offset={0} />
        <span className="hero__space" aria-hidden="true">
          {" "}
        </span>
        <span className="hero__accent">
          <Letters text="HUB" offset={4} />
        </span>
      </h1>

      <div className="hero__meta">
        <span className="hero__name">{name}</span>
        {sinceYear !== null && (
          <>
            <span className="hero__divider" aria-hidden="true" />
            <span className="hero__from">Est. {sinceYear}</span>
          </>
        )}
      </div>

      <p className="hero__tagline">Every run, over Sydney</p>
      <span className="hero__cue">Scroll</span>
    </section>
  );
}

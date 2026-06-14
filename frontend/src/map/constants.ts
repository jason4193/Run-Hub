// Map / animation constants (docs/DESIGN.md §3).

/** Free CARTO dark vector style — no token, no browser secret (ADR 0002). */
export const CARTO_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** The single neon trail color, #D97059, as [r, g, b]. */
export const TRAIL_COLOR: [number, number, number] = [217, 112, 89];

/** Full animation loop length (ms). The clock wraps every LOOP_MS. */
export const LOOP_MS = 60_000;

/**
 * Comet tail length (ms). Short relative to a route's sweep window so each run
 * reads as a moving runner with a fading trail (deck.gl Trips style), not a
 * whole route lit at once (docs/DESIGN.md §3.3).
 */
export const TRAIL_LENGTH_MS = 9_000;

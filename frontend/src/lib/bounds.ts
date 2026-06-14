import type { ActivitiesSnapshot } from "../types/snapshot";

/** A camera pose for deck.gl's MapView (docs/DESIGN.md §3.5). */
export interface ViewStateKeyframe {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface Extent {
  center: [number, number]; // [lng, lat]
  bbox: [[number, number], [number, number]]; // [[minLng, minLat], [maxLng, maxLat]]
}

// Fallback: central Sydney, if a snapshot somehow has no coordinates.
const SYDNEY_FALLBACK: Extent = {
  center: [151.2093, -33.8688],
  bbox: [
    [151.18, -33.9],
    [151.24, -33.84],
  ],
};

/** Bounding box + centre over every route vertex (and any `bounds`), in [lng, lat]. */
export function computeExtent(s: ActivitiesSnapshot): Extent {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const consider = (lat: number, lng: number): void => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  };

  for (const a of s.activities) {
    for (const [lat, lng] of a.latlngs) consider(lat, lng);
    if (a.bounds) {
      consider(a.bounds[0][0], a.bounds[0][1]);
      consider(a.bounds[1][0], a.bounds[1][1]);
    }
  }

  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) {
    return SYDNEY_FALLBACK;
  }

  return {
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    bbox: [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
  };
}

/**
 * Sydney CBD [lng, lat]. The snapshot spans the whole country (travel/race runs),
 * so fitting every activity zooms out to a continent view. The site is "over
 * Sydney", so we always frame the CBD; out-of-town runs simply fall outside it.
 */
const SYDNEY_CBD: [number, number] = [151.2093, -33.8688];

/** Base zoom that comfortably shows inner-Sydney runs around the CBD. */
const BASE_ZOOM = 12.4;

/**
 * 2–4 scripted keyframes centred on Sydney CBD. The scroll scrub interpolates
 * between these (pitch/bearing/zoom vary) to create the speed sensation, then
 * LANDS on the final frame — a clear, near-top-down framing where the runs read
 * well and the user takes over free interaction.
 *
 * `s` is currently unused (camera is pinned to the CBD) but kept so a future
 * Sydney-only extent fit can drive zoom without changing call sites.
 */
export function cameraKeyframes(_s: ActivitiesSnapshot): ViewStateKeyframe[] {
  const [longitude, latitude] = SYDNEY_CBD;

  return [
    { longitude, latitude, zoom: BASE_ZOOM - 0.4, pitch: 48, bearing: -22 }, // dramatic entry
    { longitude, latitude, zoom: BASE_ZOOM + 0.3, pitch: 56, bearing: 8 },
    { longitude, latitude, zoom: BASE_ZOOM + 0.5, pitch: 40, bearing: 0 },
    { longitude, latitude, zoom: BASE_ZOOM + 0.2, pitch: 26, bearing: 0 }, // clear explore landing
  ];
}

/**
 * Resting (hero / ambient) camera — focused on Sydney CBD with an oblique framing
 * so the neon routes are visible immediately, before any scroll.
 */
export function initialViewState(s: ActivitiesSnapshot): ViewStateKeyframe {
  return cameraKeyframes(s)[0];
}

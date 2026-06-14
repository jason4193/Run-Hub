import { TripsLayer } from "@deck.gl/geo-layers";
import type { Parameters } from "@luma.gl/core";
import type { TripPath } from "../lib/trips";
import { TRAIL_COLOR, TRAIL_LENGTH_MS } from "./constants";

// Additive ("screen"-like) blending so overlapping runs stack toward a white-hot
// core — this overlap IS the route heatmap (docs/DESIGN.md §3.3). v9 expresses the
// old `blendFunc:[SRC_ALPHA, ONE]` / `depthTest:false` via luma.gl string factors.
const ADDITIVE_BLEND: Parameters = {
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "src-alpha",
  blendColorDstFactor: "one",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "src-alpha",
  blendAlphaDstFactor: "one",
  depthCompare: "always",
};

/**
 * Build the single TripsLayer fed by every activity. Recreated each frame with a
 * fresh `currentTime`; deck.gl diffs props so only the uniform actually changes.
 */
export function createTripsLayer(
  trips: TripPath[],
  currentTime: number,
): TripsLayer<TripPath> {
  return new TripsLayer<TripPath>({
    id: "run-trails",
    data: trips,
    getPath: (d: TripPath) => d.path,
    getTimestamps: (d: TripPath) => d.timestamps,
    getColor: TRAIL_COLOR,
    currentTime,
    trailLength: TRAIL_LENGTH_MS,
    fadeTrail: true,
    capRounded: true,
    jointRounded: true,
    getWidth: 6,
    widthUnits: "meters",
    widthMinPixels: 2.5,
    widthMaxPixels: 6,
    parameters: ADDITIVE_BLEND,
  });
}

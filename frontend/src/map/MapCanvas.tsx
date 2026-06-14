import { DeckGL } from "@deck.gl/react";
import type { MapViewState } from "@deck.gl/core";
import { Map } from "react-map-gl/maplibre";
import type { MapEvent } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createTripsLayer } from "./useTripsLayer";
import { addBuildingsLayer } from "./buildingsLayer";
import { CARTO_DARK } from "./constants";
import type { TripPath } from "../lib/trips";

export interface MapCanvasProps {
  /** Controlled camera. During the scroll scrub GSAP owns this; afterwards the user does. */
  viewState: MapViewState;
  /** The animation clock value driving the comet trails. */
  currentTime: number;
  /** Trips fed to the single TripsLayer. */
  trips: TripPath[];
  /** When true the deck.gl controller is enabled (free pan/zoom/tilt). */
  interactive: boolean;
  /** Propagate user-driven camera changes back up (only fires while interactive). */
  onViewStateChange?: (vs: MapViewState) => void;
}

/**
 * deck.gl owns the camera (controlled `viewState`) so GSAP can scrub it; MapLibre
 * renders the CARTO dark basemap as a child and contributes the 3D buildings
 * (docs/DESIGN.md §3.1). Comets overlay on top with additive blending.
 */
export default function MapCanvas({
  viewState,
  currentTime,
  trips,
  interactive,
  onViewStateChange,
}: MapCanvasProps) {
  const layer = createTripsLayer(trips, currentTime);

  return (
    <DeckGL
      viewState={viewState}
      controller={interactive}
      layers={[layer]}
      onViewStateChange={(params) => {
        onViewStateChange?.(params.viewState as MapViewState);
      }}
      style={{ position: "absolute", top: "0", left: "0", width: "100%", height: "100%" }}
    >
      <Map
        mapLib={maplibregl}
        mapStyle={CARTO_DARK}
        attributionControl={false}
        onLoad={(e: MapEvent) => addBuildingsLayer(e.target)}
      />
    </DeckGL>
  );
}

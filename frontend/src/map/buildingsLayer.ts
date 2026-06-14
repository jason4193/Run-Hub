import type { Map as MaplibreMap, LayerSpecification } from "maplibre-gl";

// Modest, dark navy 3D buildings so they read as buildings from the near-top-down
// view without competing with the neon trails (docs/DESIGN.md §3.2). No custom
// modeling — we reuse the basemap's existing OpenMapTiles `building` source.

const LAYER_ID = "runhub-3d-buildings";

interface BuildingSource {
  source: string;
  sourceLayer: string;
}

/** Find the basemap's building source/source-layer so we don't hard-code names. */
function findBuildingSource(map: MaplibreMap): BuildingSource | null {
  const layers: LayerSpecification[] = map.getStyle().layers ?? [];
  for (const layer of layers) {
    if (
      "source-layer" in layer &&
      layer["source-layer"] === "building" &&
      typeof layer.source === "string"
    ) {
      return { source: layer.source, sourceLayer: layer["source-layer"] };
    }
  }
  return null;
}

/** Build the fill-extrusion layer spec bound to the given building source. */
export function buildingsLayer(src: BuildingSource): LayerSpecification {
  return {
    id: LAYER_ID,
    type: "fill-extrusion",
    source: src.source,
    "source-layer": src.sourceLayer,
    minzoom: 13,
    paint: {
      "fill-extrusion-color": "#16384a",
      // Cap height so the skyline stays modest under the oblique camera.
      "fill-extrusion-height": [
        "min",
        60,
        ["coalesce", ["get", "render_height"], 8],
      ],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.35,
    },
  };
}

/**
 * Inject the 3D buildings layer once the style is loaded. No-op if the basemap
 * exposes no building source, or if the layer is already present.
 */
export function addBuildingsLayer(map: MaplibreMap): void {
  if (map.getLayer(LAYER_ID)) return;
  const src = findBuildingSource(map);
  if (!src) return;
  map.addLayer(buildingsLayer(src));
}

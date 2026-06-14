# 2. MapLibre GL JS + free CARTO dark basemap (no Mapbox token)

Date: 2026-06-14

## Status

Accepted

## Context

The Run Hub hero is an animated neon route map (deck.gl `TripsLayer`) over a dark
3D basemap of Sydney, modelled on the deck.gl "trips" example. That example uses
**Mapbox GL JS** as the basemap, which requires a Mapbox account and a browser-
exposed access token.

Run Hub's whole architecture is built on **no secrets in the browser** and
**host-agnostic static output** (ADR 0001: the browser only ever reads a
pre-built Snapshot; the API key lives only in the build environment; v1 hosts on
GitHub Pages, final target Cloudflare Pages). Introducing a Mapbox token would:

- ship a credential in the static bundle (even a scoped/public token is a managed
  secret with rate limits and a billing surface);
- add an external account dependency and signup to an otherwise self-contained,
  free, personal project;
- couple the basemap to one vendor's tiles/pricing.

deck.gl is renderer-agnostic: `TripsLayer` and the camera (`viewState`) work
identically whether the basemap is Mapbox or MapLibre.

## Decision

Use **MapLibre GL JS** (open-source) as the basemap, loaded via
`react-map-gl/maplibre`, with a **free CARTO dark vector style** (`dark-matter`).
deck.gl's `<DeckGL>` owns `viewState`; MapLibre renders as a child;
`MapboxOverlay` with `interleaved: true` (MapLibre-compatible) composites the
deck layers between basemap layers so comets sit correctly against 3D building
extrusions.

3D buildings come from the style's **existing OpenMapTiles `building` source**
via a `fill-extrusion` layer — no Mapbox-specific data and no manually modelled
geometry.

## Consequences

- **No token, no account, no browser secret** — consistent with ADR 0001 and the
  free/static-hosting ethos. Host swap (GitHub Pages → Cloudflare Pages) stays
  trivial.
- **No vendor lock-in / no usage billing** for map tiles (CARTO's free tiles;
  swappable for any MapLibre-compatible style, including a self-hosted one later).
- The look will differ slightly from the Mapbox-based reference screenshot
  (different default building data and style tuning). We tune the CARTO dark
  style toward palette navy `#12222F` to compensate.
- If a future requirement needs Mapbox-only features (e.g. specific 3D building
  fidelity or globe view), revisiting this means adding the token dependency we
  deliberately avoided — a real, but deferred, reversal cost.

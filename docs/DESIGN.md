# Run Hub — Frontend Design

The agreed design system and map/animation model for the Run Hub frontend. Decisions were grilled in `docs/questions.md` (Design session). Data contract and API architecture are unchanged — see `CONTEXT.md` and `docs/adr/0001-prefetch-snapshot-over-live-api.md`. Basemap rationale: `docs/adr/0002-maplibre-basemap.md`.

---

## 1. Concept

A dark, cinematic, dashboard-style personal running site. The signature element is an **animated neon route map** of all the athlete's runs over Sydney, rendered as glowing comet trails (deck.gl `TripsLayer`) over a 3D dark basemap. The page is short: a **Hero** that scrolls down to **reveal the map**, which carries a **top-left control panel** (Best Efforts + lifetime stats). Motion and kinetic typography sell a "speed" feeling. Not a long multi-section scrollytelling site.

## 2. Page structure

Two primary surfaces in one viewport-driven flow:

1. **Hero** — full-bleed; the map is present behind/below as an **ambient, free-running loop**. A kinetic variable-font title (`RUN HUB`, wide/bold at rest, slightly above centre) sits on top, with the **athlete name** and a **"From `<year>`"** line (earliest run year, derived client-side) directly beneath, then the tagline + scroll cue.
2. **Map (revealed on scroll)** — a `ScrollTrigger`-**pinned** section. While pinned, scroll progress (0→1) scrubs the animation clock **and** the camera through scripted keyframes (numeric `scrub` for catch-up smoothing, so fast flicks don't jolt). Light captions reveal in sync. When the scrub completes the section **unpins** and the ambient loop resumes; the map then **unlocks** to a fully interactive state (pan / zoom / tilt 2D↔3D) only once the dedicated explore viewport fully fills the screen — i.e. **after the captions have scrolled away** — so interaction never starts mid-caption. Scrolling back up re-locks it.
   - Persistent overlay: **top-left control panel** (popover-style) — Best Efforts list + lifetime stats. Persistent on desktop; collapsible (toggle button) on mobile.
3. **Footer / about** — data source (intervals.icu), `generatedAt` "last updated", links.

## 3. Map & animation model

### 3.1 Library & integration
- **deck.gl 9.x** with **`TripsLayer`** (from `@deck.gl/geo-layers`, extends `PathLayer`).
- **`<DeckGL>`** (`@deck.gl/react`) **owns `viewState`** so GSAP can drive the camera.
- **Basemap = MapLibre GL JS** via `react-map-gl/maplibre` (`<Map mapLib={maplibregl} mapStyle={CARTO_DARK_URL}>`), rendered as a child of `<DeckGL>`. No access token, no browser secret (ADR 0002).
- **Render mode = interleaved** (`MapboxOverlay`, `interleaved:true`, MapLibre-compatible) so comets composite correctly against 3D building extrusions. Fall back to overlaid / flat on low-perf devices.
- Packages: `deck.gl @deck.gl/core @deck.gl/react @deck.gl/layers @deck.gl/geo-layers @deck.gl/mapbox maplibre-gl react-map-gl gsap`.

### 3.2 Basemap styling
- Free **CARTO dark** vector style (`dark-matter`), tuned toward palette navy `#12222F` for water/land/background.
- **3D buildings** from the style's existing OpenMapTiles `building` source via a `fill-extrusion` layer — **modest height**, dark navy fill, low opacity. No custom/manual building modeling, no terrain. Buildings exist only so they read as buildings from the near-top-down view.

### 3.3 Trails (the "heatmap")
- One `TripsLayer` fed by all activities' `latlngs`.
- **Per-vertex timestamps are synthesized client-side** for v1 (no real per-point time in the snapshot). Spread each activity's `movingTime` across its path proportional to cumulative segment distance (fallback: by index). See §3.4 for the upgrade path.
- **Motion model (deck.gl Trips style):** each route is a **moving comet** — a short trail continuously sweeps the full path once per loop, like the deck.gl traffic-trips demo. NOT "whole route lit at once": that read as a global draw-then-clear pulse at the loop wrap.
- **Stagger + seamless wrap:** each route gets a deterministic phase (hashing its activity `id`) so comets desync. Each route is emitted as **two trip copies** — this loop and the previous loop (`timestamps − loopMs`) — so the comet wraps across the loop boundary continuously and on-screen density stays uniform. This removes the global blackout/reload between cycles. Fully deterministic under scroll-scrub.
- **Tail:** short `trailLength` relative to the loop + `fadeTrail: true` → a runner-like head with a graceful fading tail.
- **Color:** single coral `#D97059` with **additive blending** (`parameters: { blend: true, blendFunc: [GL.SRC_ALPHA, GL.ONE] }` / "screen"-like). Where multiple runs overlap the same road, trails **stack brighter toward a white-hot core** — this *is* the Route Heatmap (aggregate emerges from overlap density; no separate static base layer).
- Color-encoding trails by recency/pace (coral→teal/brick) is **reserved for later** (B).

### 3.4 The animation clock (one variable, two drivers)
A single `currentTime` value drives `TripsLayer`.
- **Ambient driver (resting state):** a `requestAnimationFrame` loop advances `currentTime` whenever the map section is **not** pinned (hero, and after the scrub releases). Keeps the map alive.
- **Scroll driver (pinned state):** while the map `ScrollTrigger` is pinned, `currentTime` is **bound to scroll progress** (`scrub`), as is the camera (§3.5). The rAF loop is suspended during pin.
- Handoff is industry-standard ScrollTrigger pin/scrub; transition must be smooth (no clock jump) — seed the scrubbed range from the current ambient value on entry.

### 3.5 Camera
- During the pinned scrub the user has **no free camera control**; `viewState` is interpolated by GSAP across **2–4 keyframes** over the Sydney route cluster (vary `pitch`, `bearing`, `zoom`) on the **same 0→1 scroll progress** that drives `currentTime`. Camera motion + trail motion together create the speed sensation.
- After the scrub completes (and the captions have scrolled past — §2.2), the **deck.gl controller is enabled** → user can pan, zoom, and tilt (2D↔3D) freely.
- Initial camera (hero/ambient): an oblique framing **pinned to Sydney CBD** at a city zoom. The snapshot is multi-region (travel/race runs span the country), so fitting all activities would zoom out to a continent view; the camera is fixed on the CBD instead (see `lib/bounds.ts` and CONTEXT.md).

### 3.6 Future upgrade (reserved)
- Animation speed driven by **actual pacing**: populate the schema's reserved `time[]` per activity from intervals.icu `/streams`; the trail builder reads real `time` if present, else synthesizes (§3.3). No frontend rearchitecture required — only the timestamp source changes.

## 4. Typography

- **Display / headline: `Anybody`** (variable; `wght` + `wdth`). Unique, retro-athletic, sharp; the `wdth` axis powers the kinetic effect. Self-hosted.
- **Body / UI: `Inter`** (variable; `wght`, `opsz`). Legible workhorse for panel, stats, captions, footer. Self-hosted.
- *(Rejected: `Roboto Flex` — too common; `Telma` — a commercial script font that fights the sharp/sport brief and warps under the kinetic animation.)*

### 4.1 Kinetic type — "velocity- & cursor-reactive headline"
- **Rest:** wide, bold, upright (the resting look the athlete preferred — what was previously only the mid-scroll peak).
- **On scroll velocity:** letters expand `wdth`↑ + lean forward via skew + a `wght` pulse, then **ease back** to rest. Effect maps scroll speed → "stretch with speed."
- **On cursor proximity:** each letter leans toward the pointer when it's nearby (magnetic), easing back as the cursor moves away. Velocity (wdth/wght/skew) and pointer (x/y) run through separate gsap `quickTo` setters on one per-letter state object, composited once per frame so they never overwrite each other.
- **Stat numbers:** count up on first reveal with a brief weight pulse on settle.
- **Body/panel text:** static (legibility).
- **Accessibility:** honor `prefers-reduced-motion` → disable axis animation and count-ups; render static type and final values.

## 5. Color system

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#12222F` | Page background + map base |
| `--accent` | `#D97059` | Primary accent — **the neon trail color** + key CTAs/highlights |
| `--accent-2` | `#19656F` | Secondary accent — panel borders, captions, links, hover, count-up numbers |
| `--text` | `#A4B3BF` | Primary body/UI text on dark |
| `--muted` | `#A6554E` | Tertiary/muted — dimmed states, dividers, coral's gradient partner |

- Trails: `--accent` with additive blending → white-hot overlaps.
- Reserved palette CSS custom properties on `:root` so themes/states stay consistent.

## 6. Control panel (top-left)

- **Best Efforts:** a **minimal text list only** — `label · time · pace` for each distance (400 m → Half). **No chart** in v1 (mini-chart reserved). Sourced from `pace-curve.json` (`pace[]`).
- **Lifetime stats** (derived client-side from `activities.json`): **total distance · total runs · total time · longest run · "running since"**. Numbers **count up** via GSAP on first reveal.
- **Behavior:** persistent HUD on desktop; collapsible via toggle on mobile.
- **Styling:** dark translucent navy surface, `--accent-2` borders/labels, `--text` values.

## 7. Performance & responsiveness

- Scale today ~20 runs; cheap for deck.gl. Snapshot year-sharding (resolved API grill) is the growth path — frontend lazy-loads shards; trail builder is shard-agnostic.
- Mobile: degrade interleaved→overlaid and 3D buildings→flat if needed; collapse the panel; keep the kinetic headline but lighter.
- Respect `prefers-reduced-motion` across all GSAP/axis/count-up animation.
- Static-host friendly: everything client-side, no secrets, works on GitHub Pages (v1) and Cloudflare Pages (final).

## 8. Out of scope (v1) / reserved

- Real per-point pacing animation (needs `/streams` `time[]`) — §3.6.
- Pace-curve mini-chart inside the panel.
- Color-encoded trails by recency/pace.
- A separate fully-interactive "Explore" mode beyond the post-scrub unlock.

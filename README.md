# Run Hub

A personal, frontend-only website that displays my running logs in a minimal,
personalised style. Data comes from [intervals.icu](https://intervals.icu); the
site itself ships as static files.

> **Status:** scaffolded and runnable locally. The data layer (fetch script,
> Snapshot schema, loader) and the deploy workflow are in place; the visual
> frontend (Hero, heatmap, popover) is next — see [`docs/DESIGN.md`](./docs/DESIGN.md).

## What it shows

- **Hero** — a full-page intro describing the site.
- **Route Heatmap** — revealed on scroll; an aggregate of every run's GPS path,
  pannable/zoomable, minimal and custom-styled (no 3D terrain). Full experience
  on desktop; responsive/mobile-first elsewhere.
- **Best-efforts popover** — a side panel of all-time best pace over standard
  distances (400 m → half-marathon), each showing the run that set it.

## How it works

The browser **never calls intervals.icu directly.** A build-time fetch script
authenticates with my API key and writes a static **Snapshot** (`data/*.json`)
that the React app reads. This sidesteps CORS, keeps the (full-access) API key
out of the bundle, and flattens the heatmap's per-activity fetch into one
pre-built file. See [ADR 0001](./docs/adr/0001-prefetch-snapshot-over-live-api.md).

```
intervals.icu API ──(API key, build env only)──> scripts/fetch-snapshot.ts
                                                          │
                                          writes + commits Snapshot
                                                          ▼
                                                   data/*.json (in repo)
                                                          │
                                              Vite build copies to dist/data/
                                                          ▼
   Browser ──(fetch static JSON, no auth)──> React app  (GitHub Pages / Cloudflare)
```

**Snapshot rebuild strategy — *list-full, map-incremental*:** every rebuild
fetches the full activity list (one slim request, so backfilled past-dated runs
are caught), diffs by activity `id`, and pays the per-activity `/map` cost only
for runs not already stored. The Snapshot is committed back to the repo as the
versioned store of record.

## Tech stack

| Concern | Choice |
|---|---|
| Frontend | TypeScript · React 19 · Vite 6 |
| Fetch script | Node + TypeScript (`tsx`), zero runtime deps (native `fetch`) |
| Data source | intervals.icu API (HTTP Basic, API key) |
| Hosting (v1) | GitHub Pages — cron + manual rebuild via GitHub Actions |
| Hosting (target) | Cloudflare Pages + Workers |
| Heatmap lib | TBD in `docs/DESIGN.md` (MapLibre GL JS or Leaflet) |

No Next.js / SSR — the site is static, personal, and not SEO-targeted, so a
lightweight SPA on a free static host is the right fit.

## Data freshness & auto-update

intervals.icu has **no webhook in the personal API**, and a static site can't
receive one anyway. v1 refreshes via a daily GitHub Actions cron plus a manual
"just finished a run" trigger. The planned **Option B** (final target) adds a
small Cloudflare Worker that catches an intervals.icu app webhook and triggers a
rebuild — the fetch script is already designed to stay relay-ready.

## Repository layout

```
.github/workflows/build.yml   GitHub Actions: rebuild Snapshot + deploy to Pages
docs/
  CONTEXT.md      glossary + resolved decisions
  adr/            architecture decision records
  DESIGN.md       frontend/visual design (next)
scripts/
  fetch-snapshot.ts   Snapshot builder (the data layer)
  local-test.sh       one-shot local end-to-end check
data/             committed Snapshot JSON (store of record)
frontend/         Vite + React frontend workspace
  public/         Vite static root (build copies data/ → public/data/)
  src/
    types/snapshot.ts   shared Snapshot contract
    lib/loadSnapshot.ts host-agnostic data loader
    App.tsx, main.tsx   React shell
  index.html      Vite entry point
  vite.config.ts  Vite config (base path: /Run-Hub/ on Pages, override with BASE_PATH)
  tsconfig.json   Vite/React TypeScript config
  package.json    Frontend dependencies and scripts
package.json      Root workspace configuration (orchestrates commands)
intervals.icu.openapi-spec.json   vendored API spec
```

## Getting started

```bash
cp .env.example .env     # add INTERVALS_API_KEY (+ INTERVALS_ATHLETE_ID; 0 = self)
npm install
npm run fetch            # build data/*.json from the live API
npm run dev              # Vite dev server, reads the static Snapshot
```

### Test locally before pushing

`npm run local-test` runs the full pipeline end-to-end — fetch the live
Snapshot → typecheck → production build → serve it — so you can verify
everything works before anything reaches GitHub:

```bash
npm run local-test              # fetch + build + preview the production bundle
npm run local-test -- --no-fetch  # reuse existing data/*.json (no API call)
```

It installs dependencies if needed and fails fast with a clear message if `.env`
is missing. Open the printed preview URL; Ctrl+C to stop.

### npm scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server (reads `data/*.json`) |
| `npm run fetch` | Build the Snapshot from the live API into `data/*.json` |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production `dist/` build |
| `npm run local-test` | Full local pipeline: fetch → build → preview |
| `npm run typecheck` | Type-check only |

## Deploying

Pushing to GitHub is **not** required to develop locally. When ready: create the
repo, add `INTERVALS_API_KEY` and `INTERVALS_ATHLETE_ID` as Actions secrets, and
enable Pages (source: GitHub Actions). The workflow then rebuilds the Snapshot on
a daily cron or a manual run, commits it back, and deploys. Update
`frontend/vite.config.ts` `base` (or `BASE_PATH`) to match the repo name.

## Documentation

- [`docs/CONTEXT.md`](./docs/CONTEXT.md) — glossary and resolved decisions.
- [`docs/adr/`](./docs/adr/) — architecture decision records.

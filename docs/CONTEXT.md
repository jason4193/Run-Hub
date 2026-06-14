# Run Hub — Context Glossary

A personal, frontend-only website that displays the owner's running logs (route heatmap + all-time best pace) in a minimal, personalised style. Data originates from intervals.icu. Hosted as static files (S3 + CloudFront).

This file is a **glossary only** — canonical terms and their agreed meanings. No implementation details.

## Terms

- **Athlete** — the single account owner (one `athlete/{id}` on intervals.icu). This site is single-athlete by design.
- **Activity** — one recorded run pulled from intervals.icu (`/athlete/{id}/activities`). Run Hub displays runs only unless decided otherwise.
- **Snapshot** — the pre-fetched static JSON that the site reads at runtime. The browser **never** calls intervals.icu directly; it only reads the Snapshot. Built by a fetch script using the API key, which lives only in the build environment.
- **Route Heatmap** — the aggregate visual of all Activities' GPS paths. Source data is each Activity's decimated `latlngs` from `/activity/{id}/map`.
- **Best Effort / Pace Curve** — the Athlete's all-time best pace over a range of durations/distances, from `/athlete/{id}/pace-curves`. Shown in a side popover.

## Resolved decisions (see docs/adr/ for rationale once recorded)

- Data reaches the site as a pre-built **Snapshot**, not via live browser API calls (resolves CORS + key exposure + heatmap N+1).
- Auth: **API Key (HTTP Basic)**, stored as `.env` / CI secret — never shipped to the browser.
- No public webhook exists in the personal API; data freshness is handled by rebuilding the Snapshot. v1 trigger = GitHub Actions cron + manual run. **Final target = Option B**: webhook → serverless relay → rebuild. The fetch script stays B-ready.
- **Incremental = list-full, map-incremental**: every rebuild fetches the full activity list (one slim request), diffs by activity `id`, and calls `/map` only for unseen ids. Catches backfilled past-dated runs; never re-pays map cost.
- Scope: runs only, ~2 records/week, growing both forward and backward in time. Snapshot scales by **year-sharding** once large; fetch logic unchanged.
- Units: **metric** (km / m / cm). Pace shown as mm:ss /km.
- v1 heatmap geometry = decimated `/map` `latlngs` only. **Schema must stay forward-compatible** so elevation + time can be added later (would switch source to `/streams`).
- Snapshot persisted by **committing JSON back into the git repo** (versioned store of record + the data the build ships).
- Hosting: **v1 = GitHub Pages**; **final target = Cloudflare Pages + Workers** (where Option B lives). Build output is host-agnostic static files.
- "Run" = run-family activity types: `Run`, `TrailRun`, `VirtualRun` (the activities list has no sport filter, so the script filters by `type` client-side).

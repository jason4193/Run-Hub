# Run Hub — Context Glossary

A personal, frontend-only website that displays the owner's running logs (route heatmap + all-time best pace) in a minimal, personalised style. Data originates from intervals.icu. Hosted as static files (S3 + CloudFront).

This file is a **glossary only** — canonical terms and their agreed meanings. No implementation details.

## Terms

- **Athlete** — the single account owner (one `athlete/{id}` on intervals.icu). This site is single-athlete by design.
- **Activity** — one recorded run pulled from intervals.icu (`/athlete/{id}/activities`). Run Hub displays runs only unless decided otherwise.
- **Snapshot** — the pre-fetched static JSON that the site reads at runtime. The browser **never** calls intervals.icu directly; it only reads the Snapshot. Built by a fetch script using the API key, which lives only in the build environment.
- **Run Details** — the part of the Snapshot that records how each Activity went: heart rate, effort, the Athlete's notes and its Intervals, with no GPS. Kept as intervals.icu reports it; the training log is derived from it and never edited by hand.
- **Interval** — a segment of an Activity as intervals.icu detected it (or the Athlete edited it), typed work or recovery. Not a rep: an Interval can as easily be a warm-up, a rest or a cool-down.
- **Route Heatmap** — the visual of all Activities' GPS paths over the map. Rendered as **animated neon comet trails** (one moving comet per Activity), not a static raster; the aggregate "heatmap" emerges where trails overlap (additive blending → white-hot cores). Source data is each Activity's decimated `latlngs` from `/activity/{id}/map`.
- **Best Effort / Pace Curve** — the Athlete's all-time best pace over a range of durations/distances, from `/athlete/{id}/pace-curves`. Shown in a side popover.
- **Sync** — one rebuild: pull the Athlete's runs from intervals.icu into the Snapshot, commit it when an Activity changed, and redeploy the site. A failed Sync changes nothing and leaves the last good Snapshot live.
- **Heartbeat** — a Snapshot commit whose only change is its generation time. At most one a day, so a quiet stretch with no runs is distinguishable from a broken Sync.
- **Today** — the current date in Australia/Sydney, never the UTC date. An Activity's date is its local start date where it was run, so a morning run counts on the day it happened.

### Training

- **Coach** — the Claude Project the Athlete trains with. It reads this repo and never writes to it.
- **Inputs** — the training settings the Athlete and the Coach agreed on, kept as hand-edited files so a new Coach session starts from the same settings. They change only when a plan or goal changes. _Avoid_: config, settings files.
- **Plan** — the Input holding the goals, phases, weekly targets, checkpoints and standing rules for the block. _Avoid_: schedule, training-plan.html.
- **Change Brief** — a written instruction from the Coach to change the Inputs; the only way a Plan value, a checkpoint verdict, the Threshold Pace or a Note changes.
- **Note** — an Input entry adding to one run's log, keyed by its date: reps, a remark for the Coach, or which session the run was. Optional and rare: a run needs none to be matched. _Avoid_: log entry, override.
- **Outputs** — files derived from the Snapshot and the Inputs, regenerated on every Sync and never edited by hand. Distinct from the Snapshot, which holds only what intervals.icu reported.
- **Week** — a Monday-to-Sunday week of the Plan, numbered from Week 0 (5–11 Oct 2026) to Week 20 (race week). _Avoid_: training week, block week.
- **Weekly Target** — what a Week asks for: kilometres, a run-count range, one Quality Session, one Long Run and a strength count, on any days. The Bagels Run is the one run with a fixed day. _Avoid_: schedule, planned session.
- **Quality Session** — the Week's one structured hard session (reps at a pace, or a timed effort). The 4-lap Test is the Quality Session of its Week.
- **Long Run** — the Week's longest run, at a set distance. The Osaka Marathon is the Long Run of race week.
- **Bagels Run** — the run club's Tuesday-morning run of about 8 km at moderate effort. The Athlete keeps it by choice, so it is planned, never the Quality Session or the Long Run, and not held to the HR cap. _Avoid_: fun run.
- **Threshold Pace** — the pace set by the Week 1 time trial; unset until a Change Brief records it. _Avoid_: tempo pace.
- **Test Pace** — the pace the 4-lap Test is run at; working until Checkpoint B confirms or revises it.
- **Checkpoint** — a Quality Session whose result decides what comes next (A in Week 4, B in Week 7). Its verdict is set by a Change Brief, never by code.

## Resolved decisions (see docs/adr/ for rationale once recorded)

- Data reaches the site as a pre-built **Snapshot**, not via live browser API calls (resolves CORS + key exposure + heatmap N+1).
- Auth: **API Key (HTTP Basic)**, stored as `.env` / CI secret — never shipped to the browser.
- No public webhook exists in the personal API; data freshness is handled by rebuilding the Snapshot. v1 triggers = GitHub Actions cron once a day at 21:00 Sydney (after both morning and evening runs) + manual run + a push to `main` that changes the plan, site or sync sources (never a Snapshot-only change). **Final target = Option B**: webhook → serverless relay → rebuild. The fetch script stays B-ready.
- **Incremental = list-full, map-incremental**: every rebuild fetches the full activity list (one slim request), diffs by activity `id`, and calls `/map` only for unseen ids. Catches backfilled past-dated runs; never re-pays map cost.
- Scope: runs only, ~2 records/week, growing both forward and backward in time. Snapshot scales by **year-sharding** once large; fetch logic unchanged.
- Units: **metric** (km / m / cm). Pace shown as mm:ss /km.
- v1 heatmap geometry = decimated `/map` `latlngs` only. **Schema must stay forward-compatible** so elevation + time can be added later (would switch source to `/streams`).
- Snapshot persisted by **committing JSON back into the git repo** (versioned store of record + the data the build ships).
- Hosting: **v1 = GitHub Pages**; **final target = Cloudflare Pages + Workers** (where Option B lives). Build output is host-agnostic static files.
- "Run" = run-family activity types: `Run`, `TrailRun`, `VirtualRun` (the activities list has no sport filter, so the script filters by `type` client-side).
- **Map framing = Sydney CBD (fixed)**: the Snapshot is **multi-region** — it includes travel/race runs spanning the country (observed extent ~lat −43 to −17). The default camera is therefore **pinned to Sydney CBD** at a city zoom rather than fitting all Activities (which zooms out to a continent view). The site is framed as "over Sydney"; out-of-region runs simply fall outside the default frame. Reversible later via a Sydney-only extent fit (see `lib/bounds.ts`).

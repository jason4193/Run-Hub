# 1. Pre-fetch a static Snapshot instead of calling intervals.icu from the browser

Date: 2026-06-14

## Status

Accepted

## Context

Run Hub is a personal, frontend-only website that displays the owner's running
logs (route heatmap + all-time best pace), sourced from intervals.icu and hosted
as static files (GitHub Pages for v1, Cloudflare Pages later).

Three facts about the intervals.icu API make a naive "React app calls the API
directly" design unworkable:

1. **Auth is a full-access secret.** Every request uses HTTP Basic
   (`API_KEY:<key>`) or an OAuth Bearer token, each granting full **read/write**
   to the account. Shipping it in a static bundle exposes it to anyone.
2. **No documented browser CORS.** The API (`https://intervals.icu`) advertises
   no cross-origin allowance; browser `fetch()` would very likely be blocked.
3. **Heatmap is an N+1 fetch.** There is no account-wide "all routes" endpoint.
   The route geometry comes from `/activity/{id}/map`, one call per activity, so
   a live page load would fan out into hundreds of authenticated requests and
   risk rate limits.

Additionally, intervals.icu exposes **no webhook in the personal API**, so there
is no push path a static site could consume even if CORS were solved.

## Decision

The browser **never** calls intervals.icu. A Node/TypeScript **fetch script**
(`scripts/fetch-snapshot.ts`) runs in a trusted build environment, authenticates
with the API key, and writes static JSON — the **Snapshot** (`data/*.json`). The
React app only ever reads the Snapshot.

Supporting choices that follow from this decision:

- The API key lives only in `.env` / CI secrets, never in the shipped bundle.
- The Snapshot is **committed back into the git repo** as the versioned store of
  record and the data the build ships.
- Rebuild strategy is **list-full, map-incremental**: fetch the full activity
  list each run (cheap, catches backfilled past-dated runs), diff by activity
  `id`, and pay the per-activity `/map` cost only once per activity.
- Data freshness is handled by rebuilding the Snapshot (GitHub Actions cron +
  manual trigger for v1).

## Consequences

**Positive**
- Resolves CORS, key exposure, and the heatmap N+1 in a single stroke.
- The site stays 100% static and host-agnostic — GitHub Pages → Cloudflare Pages
  is a host swap, not a rewrite.
- Snapshots are versioned and diff-able in git; a bad build can't silently
  corrupt history (the script writes atomically and preserves the last good
  Snapshot on failure).

**Negative / trade-offs**
- Data is **not live** — it is as fresh as the last rebuild. Acceptable because
  running logs are not real-time; a daily cron plus a manual "just finished a
  run" trigger covers the need.
- True auto-update-on-upload requires a small serverless **relay** (the planned
  "Option B": webhook → Worker → rebuild). The static site alone cannot receive
  a webhook. This is deferred, and the fetch script is designed to stay
  relay-ready (no change needed when the relay is added).
- The Snapshot grows with history; mitigated later by year-sharding the JSON.

## Alternatives considered

- **Direct browser → API calls.** Rejected: exposes the full-access key, almost
  certainly blocked by CORS, and fans out into an N+1 heatmap fetch.
- **Serverless proxy** (Lambda@Edge / CF Function) injecting the key and CORS
  headers. Rejected for v1: adds a backend, contradicts "frontend-only," and
  still exposes a callable proxy. (A minimal version returns later as Option B,
  but only to *trigger a rebuild*, not to proxy live data.)

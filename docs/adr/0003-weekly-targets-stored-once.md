# 3. The Plan is weekly targets, each fact stored once

Date: 2026-10-12

## Status

Accepted

## Context

The Plan (`training/plan.yaml`) began as a day-by-day schedule in the Coach's
`training-plan.html`. The Athlete's social runs and weekday timing vary, so a
fixed weekday plan produced "missed" sessions that weren't really missed, and
that hid the signals that matter: weekly kilometres, the quality session, the
long run and easy-run discipline (Coach's change brief, 11 Oct 2026).

The rebuilt HTML still said most things twice. Every week carried its own start
date, session ids, a label and a text description, and those can all be worked
out from the week number and the structured target. Weeks 4 and 7 repeated the
checkpoint rules, and the pace-to-lap-time table is arithmetic on the lap length.
Every repeat is a place for a Change Brief to update one copy and miss the other.

## Decision

- Each week holds **targets, not days**: kilometres, a run-count range, one
  quality session, one long run and a strength count. Which day each run happens
  is free.
- **Each fact is stored once; readers compute the rest.** The Plan stores the
  block's start date, not each week's dates. It stores no session ids, labels,
  descriptions, per-week phase or lap-time table. Week n starts `block.start + 7n`
  days, and its sessions are `wNN-quality` and `wNN-long`.
- The test and the race live once, in `goals`. Their weeks say `quality: test`
  and `long: race`.
- `scripts/lib/plan.ts` checks the format (shapes, pace forms, exactly one
  test and one race week with each goal's date inside it), never the values.
  `scripts/lib/plan-view.ts` computes the derived facts for the Sync and, later,
  the page.

## Consequences

- A Change Brief edits one line per change. Repeating a week after a failed
  checkpoint shifts every later date with no further edits.
- The Coach reads the YAML directly but can't run the helpers. The header
  comment in `plan.yaml` gives the arithmetic, and the Outputs will carry the
  computed values.
- This departs from #4's original field-for-field schema (`start`, `label`,
  `desc`, `id`, `type` + `date` on sessions, `pace_lap_table`,
  `hr_cap_bpm` + `hr_cap_history`).

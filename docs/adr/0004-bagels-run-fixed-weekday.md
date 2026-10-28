# 4. The Bagels Run is the Plan's one fixed-weekday run

Date: 2026-10-28

## Status

Accepted

## Context

ADR 0003 made the Plan weekly targets, with every run free to fall on any day.
The Athlete also runs with a run club every Tuesday morning: about 8 km at
moderate effort, kept by choice (Coach's change brief, 28 Oct 2026). Judged as
an easy run, it would be over the HR cap and flagged every week. Matched as a
long run or a quality session, it would hide the sessions the Plan asks for.

## Decision

- The Plan stores it once, in `block.bagels_run`: weekday, distance, effort,
  the date it starts and a note. Weeks don't repeat it.
- It is the one run tied to a weekday. Every other run can still fall on any
  day.
- It counts toward the week's kilometres and runs. It is never the Quality
  Session or the Long Run, and it isn't held to the HR cap.
- The Coach's brief calls it `fun_run`. The repo uses the run club's name.

## Consequences

- Matching and judging it (#7, #8) can read one block entry instead of
  guessing which run was social.
- A new standing rule follows from the fixed day: the Quality Session is never
  the day after the Bagels Run.
- If the club moves its day or the Athlete stops going, a Change Brief edits or
  removes one entry.

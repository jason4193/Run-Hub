# 5. The Quality Session is matched by the shape of its segments

Date: 2026-10-28

## Status

Accepted

## Context

The Coach's 11 Oct matching note and 28 Oct brief said detected intervals
"never choose the run": a Quality Session was matched only by a Note or by a
keyword in the run's name or description. On real data that found none of the
first three sessions. Every run is named "Run", and only two runs have a
description. It also left the Athlete writing a Note for every session.

The watch is set up so the shape of a session survives the trip to
intervals.icu:

- Distance and time reps are recorded through an Apple Watch custom workout.
  Each step ends on target and the workout switches between rep and recovery.
- Lap reps are recorded by pressing a segment every lap.

The step and segment boundaries arrive exactly. The work/recovery type does
not: on 7 Oct every segment, the five-minute standing rests too, is `WORK`, and
on 21 Oct so are the warm-up and every jog recovery. The watch also auto-laps
every kilometre, so easy and long runs are full of 1 km segments.

## Decision

- Each Week's Quality Session is the run whose segments fit its target, judged
  on distance, time and pace only, never on the interval type. A segment fits
  when its pace is within 15% of the target pace and its distance (or, for a
  time target, its elapsed time) is within 10% of the target. For a lap target,
  consecutive fitting segments are joined into one rep. A run is the session
  when at least half the target's reps fit.
- Order of evidence: a Note, then the test's fixed date, then shape, then a
  keyword. Two runs at the same step leave the week unmatched rather than guess.
- The same rules extract the reps, unless a Note gives them.
- Code gathers and arranges. It keeps every rep it finds and makes no
  judgement; the Coach does the analysis.

## Consequences

- Notes become optional reference for the Coach, never required for matching.
- Auto-laps fail the pace window. On Weeks 0–3, shape matches 7 Oct and 21 Oct
  and no easy, long or Bagels Run.
- A session recorded without the custom workout or lap presses (one long
  segment) is found only by a Note or a keyword. #8's `quality_candidate` flag
  points at a likely run that fitted neither.
- The rule depends on the watch setup. If the Athlete changes how sessions are
  recorded, revisit this ADR.

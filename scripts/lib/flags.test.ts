import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DetailInterval, RunDetail, RunDetailsSnapshot } from "./details.ts";
import { loadNotes } from "./notes.ts";
import { loadPlan } from "./plan.ts";
import { deriveSessions } from "./sessions.ts";
import { deriveWeeks, type WeekRow } from "./weeks.ts";

/** The live Run Details, cut to 13 Sep – 27 Oct so new runs never move the numbers. */
const live: RunDetailsSnapshot = JSON.parse(readFileSync(new URL("../../data/run-details.json", import.meta.url), "utf8"));
const fixture = {
  runs: live.runs.filter((r) => r.start_date_local !== null && r.start_date_local >= "2026-09-13" && r.start_date_local < "2026-10-28"),
};
const plan = await loadPlan();
const notes = await loadNotes(plan);

function weeksOn(today: string, runs = fixture.runs) {
  const cut = runs.filter((r) => r.start_date_local === null || r.start_date_local.slice(0, 10) <= today);
  const { sessions } = deriveSessions(cut, plan, notes, today);
  return deriveWeeks(sessions, cut, plan, today);
}

/** A segment: distance m, elapsed s, moving s (defaults to elapsed), HR. */
const seg = (distance: number, elapsed: number, moving = elapsed, hr: number | null = 170): DetailInterval => ({
  type: "WORK", label: null, distance, moving_time: moving, elapsed_time: elapsed, average_heartrate: hr, max_heartrate: hr,
});
/** A made-up run from its segments. */
function made(id: string, start: string, segs: DetailInterval[]): RunDetail {
  return {
    id, start_date_local: start, type: "Run", name: "Run",
    distance: segs.reduce((a, s) => a + (s.distance ?? 0), 0),
    moving_time: segs.reduce((a, s) => a + (s.moving_time ?? 0), 0),
    average_heartrate: 150, max_heartrate: 180, icu_hr_zone_times: null, icu_hr_zones: null,
    icu_rpe: null, feel: null, description: null, analyzed: null, icu_intervals: segs,
  };
}

const all = (w: WeekRow[]) => w.flatMap((r) => r.flags);
const tuples = (w: WeekRow[]) => all(w).map((f) => [f.kind, f.week, f.date, f.run_id]);
const TODAY = "2026-10-28";

test("27 Oct fixture flags, W0 to W3", () => {
  const w = weeksOn(TODAY);
  assert.deepEqual(tuples(w), [
    ["over_cap", 0, "2026-10-06", "i194214652"],
    ["long_over_plan", 0, "2026-10-10", "i195709793"],
    ["over_cap", 0, "2026-10-10", "i195709793"],
    ["week_km", 0, null, null],
    ["long_over_plan", 1, "2026-10-18", "i198516161"],
    ["day_after_bagels", 2, "2026-10-21", "i199861035"],
    ["spread", 2, "2026-10-21", "i199861035"],
    ["over_cap", 3, "2026-10-27", "i202207443"],
  ]);
  for (const row of w) assert.ok(row.flags.every((f) => f.week === row.n));
  const cap3 = w[3].flags.find((f) => f.kind === "over_cap");
  assert.deepEqual(cap3?.zone_s, [217, 67, 1059, 509, 0, 0, 0]);
  const wk = all(w).find((f) => f.kind === "week_km");
  assert.ok(wk && !("zone_s" in wk));
  assert.ok(all(w).every((f) => f.run_id !== "i199236577" && f.run_id !== "i202079533"));
  assert.ok(!w[0].flags.some((f) => f.kind === "spread"));
});

test("a run with no quality matched is a quality_candidate", () => {
  const runs = fixture.runs.map((r) => (r.id === "i197510215" ? { ...r, description: null } : r));
  const w = weeksOn(TODAY, runs);
  assert.equal(w[1].quality.run_id, null);
  assert.deepEqual(
    tuples(w).filter((t) => t[0] === "quality_candidate"),
    [["quality_candidate", 1, "2026-10-15", "i197510215"]],
  );
});

test("a fast run beside a matched quality session is easy_too_fast", () => {
  const fast = (id: string, start: string) =>
    made(id, start, [seg(1500, 540), seg(1000, 310), seg(1000, 310), seg(1000, 310), seg(1000, 310), seg(500, 200)]);
  const a = weeksOn(TODAY, [...fixture.runs, fast("x1", "2026-10-24T08:00:00")]);
  assert.ok(tuples(a).some((t) => t.join() === ["easy_too_fast", 2, "2026-10-24", "x1"].join()));
  const b = weeksOn(TODAY, [...fixture.runs, fast("x2", "2026-10-26T08:00:00")]);
  assert.ok(tuples(b).some((t) => t.join() === ["quality_candidate", 3, "2026-10-26", "x2"].join()));
  const none = tuples(weeksOn(TODAY));
  assert.ok(none.every((t) => t[0] !== "easy_too_fast" && t[0] !== "quality_candidate"));
});

test("Sunday long run then Monday quality session, across weeks", () => {
  const runs = [
    ...fixture.runs,
    made("x3", "2026-11-01T07:00:00", [seg(15000, 5400)]),
    { ...made("x4", "2026-11-02T07:00:00", [seg(6000, 2100)]), description: "quality" },
  ];
  const t = tuples(weeksOn("2026-11-03", runs)).map((x) => x.join());
  assert.ok(t.includes(["consecutive", 4, "2026-11-02", "x4"].join()));
  assert.ok(t.includes(["missed", 3, null, null].join()));
});

test("week_km never for the race week", () => {
  const weeks = weeksOn("2027-03-01").flatMap((r) => r.flags.filter((f) => f.kind === "week_km").map((f) => f.week));
  for (let n = 4; n <= 19; n++) assert.ok(weeks.includes(n), `week ${n}`);
  assert.ok(!weeks.includes(20));
});

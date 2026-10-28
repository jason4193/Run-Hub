import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { RunDetailsSnapshot } from "./details.ts";
import { loadNotes } from "./notes.ts";
import { loadPlan } from "./plan.ts";
import { weekView } from "./plan-view.ts";
import { deriveSessions } from "./sessions.ts";
import { deriveWeeks } from "./weeks.ts";

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
const without = (...ids: string[]) => fixture.runs.filter((r) => !ids.includes(r.id));
const TODAY = "2026-10-28";

test("all 21 weeks, W0 first, with their dates", () => {
  const w = weeksOn(TODAY);
  assert.equal(w.length, 21);
  assert.equal(w[0].from, "2026-10-05");
  assert.equal(w[0].to, "2026-10-11");
  assert.equal(w[3].phase, "Build the engine");
  assert.deepEqual(w[0].strength, { planned: 2 });
});

test("state turns finished on the Monday after", () => {
  const w = weeksOn(TODAY);
  assert.equal(w[2].state, "finished");
  assert.equal(w[3].state, "current");
  assert.equal(w[4].state, "future");
  assert.equal(weeksOn("2026-11-01")[3].state, "current");
  assert.equal(weeksOn("2026-11-02")[3].state, "finished");
});

test("km and runs count split warm-ups as one run", () => {
  const w = weeksOn(TODAY);
  assert.deepEqual(w[0].km, { planned: 28, actual: 37.5 });
  assert.equal(w[0].runs.count, 3);
  assert.equal(w[1].km.actual, 34.8);
  assert.deepEqual(w[1].runs, { count: 4, min: 4, max: 5 });
  assert.equal(w[2].km.actual, 34.3);
  assert.equal(w[2].runs.count, 5);
  assert.equal(w[3].km.actual, 13);
  assert.equal(w[3].runs.count, 2);
  assert.equal(w[4].km.actual, 0);
  assert.equal(w[4].runs.count, 0);
});

test("quality result in GPS pace, all-out reps left out", () => {
  const w = weeksOn(TODAY);
  assert.deepEqual(w[0].quality, {
    id: "w00-quality", kind: "quality", text: weekView(plan, 0).quality.text, status: "done",
    run_id: "i194473587", date: "2026-10-07", reps: 4, reps_planned: 4, spread_s: 2,
    avg_pace_s_per_km: 253, avg_pace: "4:13", target_pace_s_per_km: 250, target_pace: "4:10", delta_s: 3, all_out: [3],
  });
  const q2 = w[2].quality;
  assert.equal(q2.run_id, "i199861035");
  assert.equal(q2.reps, 5);
  assert.equal(q2.reps_planned, 6);
  assert.equal(q2.spread_s, 28);
  assert.equal(q2.avg_pace, "4:20");
  assert.equal(q2.target_pace, "4:15");
  assert.equal(q2.delta_s, 5);
  assert.deepEqual(q2.all_out, []);
  const q1 = w[1].quality;
  assert.equal(q1.status, "done");
  assert.equal(q1.reps, 0);
  assert.equal(q1.spread_s, null);
  assert.equal(q1.avg_pace, null);
  assert.equal(q1.target_pace, null);
  assert.equal(q1.delta_s, null);
  assert.equal(w[3].quality.status, "pending");
  assert.equal(w[3].quality.run_id, null);
  assert.equal(w[3].quality.target_pace, "4:20");
});

test("quality missed only once its week is finished", () => {
  assert.equal(weeksOn("2026-11-02")[3].quality.status, "missed");
  assert.equal(weeksOn(TODAY)[3].quality.status, "pending");
});

test("long run status: done from 80%, partial or missed at week end", () => {
  const w = weeksOn(TODAY);
  const l0 = w[0].long;
  assert.equal(l0.status, "done");
  assert.equal(l0.planned_km, 12);
  assert.equal(l0.actual_km, 21.3);
  assert.equal(l0.run_id, "i195709793");
  assert.equal(l0.date, "2026-10-10");
  assert.equal(w[2].long.status, "done");
  assert.equal(w[2].long.actual_km, 12.3);
  assert.equal(w[3].long.status, "pending");
  assert.equal(w[3].long.actual_km, null);
  assert.equal(w[3].long.run_id, null);
  const l3 = weeksOn("2026-11-02")[3].long;
  assert.equal(l3.status, "partial");
  assert.equal(l3.run_id, "i202207443");
  assert.equal(l3.actual_km, 5);
  const missed = weeksOn(TODAY, without("i201433574", "i200612220", "i200625554"));
  assert.equal(missed[2].long.status, "missed");
});

test("Bagels Run status", () => {
  const w = weeksOn(TODAY);
  assert.equal(w[0].bagels.status, null);
  assert.equal(w[1].bagels.status, null);
  assert.deepEqual(w[2].bagels, { status: "done", run_id: "i199236577", date: "2026-10-20" });
  assert.equal(w[3].bagels.status, "done");
  assert.equal(w[3].bagels.run_id, "i202079533");
  assert.equal(w[4].bagels.status, "pending");
  assert.equal(w[10].bagels.status, null);
  assert.equal(weeksOn(TODAY, without("i199236577"))[2].bagels.status, "missed");
});

test("easy_share by average HR, zones summed for the Coach", () => {
  const w = weeksOn(TODAY);
  assert.deepEqual(w.slice(0, 5).map((r) => r.easy_share), [0, 1, 1, 0, null]);
  assert.deepEqual(w.slice(0, 5).map((r) => r.moderate_share), [null, null, 0.21, 0.6, null]);
  assert.deepEqual(w[2].easy_zones, { bounds_bpm: [145, 153, 162, 171, 176, 181, 192], s: [6701, 1169, 180, 53, 0, 0, 0] });
  assert.equal(w[4].easy_zones, null);
});

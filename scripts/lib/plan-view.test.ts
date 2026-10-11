import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlan } from "./plan.ts";
import { fixtureYaml } from "./plan-fixture.ts";
import {
  describeLong,
  describeQuality,
  lapRange,
  phaseOf,
  resolvePace,
  sessionId,
  weekEnd,
  weekOf,
  weekStart,
  weekView,
} from "./plan-view.ts";

const plan = parsePlan(fixtureYaml(), "fixture.yaml");

test("Week n runs Monday to Sunday from block.start + 7n days", () => {
  assert.equal(weekStart(plan, 0), "2026-10-05");
  assert.equal(weekEnd(plan, 0), "2026-10-11");
  assert.equal(weekStart(plan, 2), "2026-10-19");
  assert.equal(weekEnd(plan, 2), "2026-10-25");
});

test("weekOf finds the week of a date, and null outside the Plan", () => {
  assert.equal(weekOf(plan, "2026-10-05"), 0);
  assert.equal(weekOf(plan, "2026-10-11"), 0);
  assert.equal(weekOf(plan, "2026-10-12"), 1);
  assert.equal(weekOf(plan, "2026-10-25"), 2);
  assert.equal(weekOf(plan, "2026-10-04"), null);
  assert.equal(weekOf(plan, "2026-10-26"), null);
});

test("session ids are wNN-quality and wNN-long", () => {
  assert.equal(sessionId(4, "quality"), "w04-quality");
  assert.equal(sessionId(20, "long"), "w20-long");
});

test("a week's phase is the last phase starting at or before it", () => {
  assert.equal(phaseOf(plan, 0).name, "Transition");
  assert.equal(phaseOf(plan, 1).name, "Build");
  assert.equal(phaseOf(plan, 2).name, "Build");
});

test("resolvePace: m:ss as is, test from goals, threshold from block, null while unset and for max_even", () => {
  assert.equal(resolvePace(plan, "4:20"), "4:20");
  assert.equal(resolvePace(plan, "test"), "4:10");
  assert.equal(resolvePace(plan, "threshold"), null);
  assert.equal(resolvePace(plan, "max_even"), null);
  const set = parsePlan(fixtureYaml((p) => (p.block.threshold.pace = "4:30")), "fixture.yaml");
  assert.equal(resolvePace(set, "threshold"), "4:30");
});

test("lapRange is seconds per lap over the 450–480 m lap, rounded", () => {
  assert.deepEqual(lapRange(plan, "4:00"), [108, 115]);
  assert.deepEqual(lapRange(plan, "4:10"), [113, 120]);
  assert.deepEqual(lapRange(plan, "7:00"), [189, 202]);
});

test("describeQuality covers laps, distance, duration, one rep and no rest", () => {
  assert.equal(describeQuality({ reps: 4, distance_m: 1000, pace: "4:10", rest_s: 180 }), "4 × 1 km @ 4:10, 3 min rest");
  assert.equal(describeQuality({ reps: 3, distance_m: 400, pace: "test" }), "3 × 400 m @ test pace");
  assert.equal(describeQuality({ reps: 1, duration_s: 1800, pace: "max_even" }), "30 min @ max even");
  assert.equal(describeQuality({ reps: 6, laps_per_rep: 2, pace: "4:15", rest_s: 90 }), "6 × 2 laps @ 4:15, 90 s rest");
  assert.equal(describeQuality({ reps: 4, laps_per_rep: 1, pace: "7:00" }), "4 × 1 lap @ 7:00");
  assert.equal(describeQuality({ reps: 2, duration_s: 720, pace: "threshold", rest_s: 180 }), "2 × 12 min @ threshold, 3 min rest");
});

test("describeLong covers easy, one pace and a pace range", () => {
  assert.equal(describeLong({ distance_km: 12, pace: "easy" }), "12 km easy");
  assert.equal(describeLong({ distance_km: 42.2, pace: "7:00" }), "42.2 km @ 7:00");
  assert.equal(describeLong({ distance_km: 18, pace: ["7:00", "7:15"] }), "18 km @ 7:00–7:15");
});

test("weekView resolves the test from goals.four_lap", () => {
  const w = weekView(plan, 1);
  assert.equal(w.start, "2026-10-12");
  assert.equal(w.end, "2026-10-18");
  assert.equal(w.phase, "Build");
  assert.equal(w.flag, "taper");
  assert.deepEqual(w.quality, {
    id: "w01-quality",
    kind: "test",
    date: "2026-10-13",
    target: { reps: 5, laps_per_rep: 4, pace: "test", rest_s: 600 },
    text: "Test: 5 × 4 laps @ test pace, 10 min rest",
  });
  assert.deepEqual(w.long, {
    id: "w01-long",
    kind: "long",
    date: null,
    target: { distance_km: 16, pace: ["7:00", "7:15"] },
    text: "16 km @ 7:00–7:15",
  });
});

test("weekView resolves the race from goals.osaka", () => {
  const w = weekView(plan, 2);
  assert.deepEqual(w.long, {
    id: "w02-long",
    kind: "race",
    date: "2026-10-25",
    target: { distance_km: 42.2, pace: "7:00" },
    text: "Race: 42.2 km @ 7:00",
  });
  assert.equal(w.quality.kind, "quality");
  assert.equal(w.quality.text, "20 min @ threshold");
});

test("weekView throws for a week the Plan doesn't have", () => {
  assert.throws(() => weekView(plan, 3), RangeError);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { RunDetailsSnapshot } from "./details.ts";
import { loadNotes } from "./notes.ts";
import { loadPlan } from "./plan.ts";
import { DeriveError, deriveSessions } from "./sessions.ts";
import { deriveStatus, statusText, STATUS_MAX_BYTES, type PaceCurve } from "./status.ts";
import { deriveWeeks } from "./weeks.ts";

/** The live Run Details, cut to 13 Sep – 27 Oct so new runs never move the numbers. */
const live: RunDetailsSnapshot = JSON.parse(readFileSync(new URL("../../data/run-details.json", import.meta.url), "utf8"));
const fixture = {
  runs: live.runs.filter((r) => r.start_date_local !== null && r.start_date_local >= "2026-09-13" && r.start_date_local < "2026-10-28"),
};
const plan = await loadPlan();
const notes = await loadNotes(plan);
const paceCurve: PaceCurve = JSON.parse(readFileSync(new URL("../../data/pace-curve.json", import.meta.url), "utf8"));

function statusOn(today: string, runs = fixture.runs) {
  const cut = runs.filter((r) => r.start_date_local === null || r.start_date_local.slice(0, 10) <= today);
  const notesCut = { ...notes, entries: Object.fromEntries(Object.entries(notes.entries).filter(([date]) => date <= today)) };
  const { sessions } = deriveSessions(cut, plan, notesCut, today);
  return deriveStatus(deriveWeeks(sessions, cut, plan, today), sessions, plan, paceCurve, today, live.generatedAt);
}

test("8 Oct: Week 0 current, quality done, next is Week 1", () => {
  const s = statusOn("2026-10-08");
  assert.ok(s.current_week);
  assert.equal(s.current_week.n, 0);
  assert.equal(s.current_week.quality.status, "done");
  assert.deepEqual(s.current_week.remaining, { km_left: 11.8, runs_left: [2, 3] });
  assert.ok(!("flags" in s.current_week));
  assert.ok(s.next_quality);
  assert.equal(s.next_quality.id, "w01-quality");
  assert.deepEqual(s.next_quality.week, { n: 1, from: "2026-10-12", to: "2026-10-18" });
  assert.equal(s.next_quality.rep_range, null);
  assert.equal(s.goals.four_lap.days_left, 68);
  assert.equal(s.goals.osaka.days_left, 143);
  assert.deepEqual(s.sync, {
    last_activity_date: "2026-10-07",
    days_since_last_run: 1,
    note: "compare generatedAt to now; if > 2 days old the Action has stopped",
  });
});

test("12 Oct is Week 1", () => {
  assert.equal(statusOn("2026-10-12").current_week?.n, 1);
});

test("28 Oct: Week 3, its quality next, flags of the last four weeks", () => {
  const s = statusOn("2026-10-28");
  assert.equal(s.current_week?.n, 3);
  assert.deepEqual(s.current_week?.remaining, { km_left: 23, runs_left: [2, 3] });
  assert.ok(s.next_quality);
  assert.equal(s.next_quality.id, "w03-quality");
  assert.equal(s.next_quality.date, null);
  assert.deepEqual(s.next_quality.rep_range_s, [351, 374]);
  assert.equal(s.next_quality.rep_range, "5:51–6:14");
  assert.deepEqual(s.last_4_weeks.map((w) => w.n), [2, 1, 0]);
  assert.deepEqual(s.last_4_weeks[0], {
    n: 2, from: "2026-10-19",
    km: { planned: 34, actual: 34.3 },
    runs: { count: 5, min: 4, max: 5 },
    quality: { status: "done", spread_s: 28, avg_pace: "4:20", target_pace: "4:15", delta_s: 5 },
    long: { status: "done", planned_km: 13, actual_km: 12.3 },
    bagels: { status: "done" },
    easy_share: 1, moderate_share: 0.21,
  });
  assert.equal(s.flags.length, 8);
  assert.deepEqual(s.checkpoints, [
    { id: "A", week: { n: 4, from: "2026-11-02", to: "2026-11-08" }, verdict: "pending", note: null },
    { id: "B", week: { n: 7, from: "2026-11-23", to: "2026-11-29" }, verdict: "pending", note: null },
  ]);
  assert.deepEqual(s.best_efforts.map((b) => [b.label, b.time, b.pace]), [
    ["400 m", "1:16", "3:10"],
    ["1 km", "3:41", "3:41"],
    ["5 km", "24:27", "4:53"],
  ]);
  assert.deepEqual(s.goals.four_lap, { date: "2026-12-15", days_left: 48, test_pace: "4:10", test_pace_status: "working" });
  assert.deepEqual(Object.keys(s), [
    "schemaVersion", "generatedAt", "today", "sync", "current_week", "next_quality", "goals",
    "checkpoints", "last_4_weeks", "best_efforts", "flags",
  ]);
});

test("flags beyond the last four finished weeks stay out of status", () => {
  const s = statusOn("2026-11-30");
  assert.ok(s.flags.every((f) => f.week === 8 || (f.week >= 4 && f.week <= 7)));
});

test("outside the block", () => {
  const before = statusOn("2026-10-01");
  assert.equal(before.current_week, null);
  assert.equal(before.next_quality?.id, "w00-quality");
  const after = statusOn("2027-03-01");
  assert.equal(after.current_week, null);
  assert.equal(after.next_quality, null);
});

test("status.json is one line under 10 KB, and too big fails", () => {
  const s = statusOn("2026-10-28");
  const text = statusText(s);
  assert.equal(text.indexOf("\n"), text.length - 1);
  assert.ok(Buffer.byteLength(text) < STATUS_MAX_BYTES);
  const big = { ...s, flags: Array.from({ length: 200 }, (_, i) => s.flags[i % s.flags.length]) };
  assert.throws(() => statusText(big), DeriveError);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DetailInterval, RunDetail, RunDetailsSnapshot } from "./details.ts";
import { loadNotes, type Notes } from "./notes.ts";
import { loadPlan } from "./plan.ts";
import { weekEnd, weekStart } from "./plan-view.ts";
import { DeriveError, deriveSessions, type SessionRow } from "./sessions.ts";

/** The live Run Details, cut to 13 Sep – 27 Oct so new runs never move the numbers. */
const live: RunDetailsSnapshot = JSON.parse(readFileSync(new URL("../../data/run-details.json", import.meta.url), "utf8"));
const fixture = {
  runs: live.runs.filter((r) => r.start_date_local !== null && r.start_date_local >= "2026-09-13" && r.start_date_local < "2026-10-28"),
};
const plan = await loadPlan();
const notes = await loadNotes(plan);

/** The live notes with `edit` applied to a copy. */
function notesWith(edit: (entries: Notes["entries"]) => void): Notes {
  const copy: Notes = structuredClone(notes);
  edit(copy.entries);
  return copy;
}
function derive(runs: RunDetail[] = fixture.runs, n: Notes = notes) {
  return deriveSessions(runs, plan, n);
}
function row(rows: SessionRow[], id: string): SessionRow {
  const r = rows.find((s) => s.id === id);
  assert.ok(r, `no row ${id}`);
  return r;
}

test("every run from 13 Sep to 27 Oct is a row, newest first", () => {
  const { sessions } = derive();
  assert.equal(sessions.length, 27);
  assert.equal(sessions[0].id, "i202207443");
  assert.equal(sessions.at(-1)!.id, "i186441590");
  for (let i = 0; i < sessions.length - 1; i++) {
    assert.ok(sessions[i].date >= sessions[i + 1].date);
  }
});

test("a row renames Run Details fields", () => {
  const r = row(derive().sessions, "i199861035");
  assert.equal(r.date, "2026-10-21");
  assert.equal(r.distance_m, 8236);
  assert.equal(r.moving_s, 3045);
  assert.equal(r.pace_s_per_km, 370);
  assert.equal(r.pace, "6:10");
  assert.equal(r.avg_hr_bpm, 158);
  assert.equal(r.max_hr_bpm, 190);
  assert.deepEqual(r.hr_zone_s, [1285, 62, 113, 331, 323, 564, 306]);
  assert.equal(r.rpe, 6);
  assert.equal(r.feel, null);
  assert.equal(r.name, "Run");
  assert.equal(r.under_cap, false);
});

test("7 Oct is Week 0's quality session through its Note", () => {
  const r = row(derive().sessions, "i194473587");
  assert.equal(r.type, "quality");
  assert.equal(r.plan_session_id, "w00-quality");
});

test("15 Oct is Week 1's quality session by keyword; its warm-up is easy", () => {
  const { sessions } = derive();
  const q = row(sessions, "i197510215");
  assert.equal(q.type, "quality");
  assert.equal(q.plan_session_id, "w01-quality");
  const warm = row(sessions, "i197510190");
  assert.equal(warm.type, "easy");
  assert.equal(warm.plan_session_id, null);
});

test("the 10 Oct long run is Week 0's long run, not quality", () => {
  const r = row(derive().sessions, "i195709793");
  assert.equal(r.type, "long");
  assert.equal(r.plan_session_id, "w00-long");
});

test("the Tuesday-morning runs from 20 Oct are Bagels Runs", () => {
  const { sessions } = derive();
  for (const id of ["i199236577", "i202079533"]) {
    const r = row(sessions, id);
    assert.equal(r.type, "bagels");
    assert.equal(r.plan_session_id, null);
  }
});

test("29 Sep is unplanned, with no cap in force", () => {
  const r = row(derive().sessions, "i191360171");
  assert.equal(r.type, "unplanned");
  assert.equal(r.plan_session_id, null);
  assert.equal(r.under_cap, null);
  assert.deepEqual(r.reps, []);
});

test("under_cap uses the cap in force on the run's date", () => {
  const { sessions } = derive();
  assert.equal(row(sessions, "i198516161").under_cap, true);
  assert.equal(row(sessions, "i201433574").under_cap, true);
  assert.equal(row(sessions, "i202207443").under_cap, false);
});

test("in the week still running, the longest run so far is the long run", () => {
  const r = row(derive().sessions, "i202207443");
  assert.equal(r.type, "long");
  assert.equal(r.plan_session_id, "w03-long");
});

test("every plan week has one long run, no shorter than any easy run", () => {
  const { sessions } = derive();
  for (let n = 0; n <= 3; n++) {
    const start = weekStart(plan, n);
    const end = weekEnd(plan, n);
    const inWeek = sessions.filter((s) => s.date >= start && s.date <= end);
    const longs = inWeek.filter((s) => s.type === "long");
    assert.equal(longs.length, 1, `Week ${n} long runs`);
    for (const e of inWeek.filter((s) => s.type === "easy")) {
      assert.ok((longs[0].distance_m ?? 0) >= (e.distance_m ?? 0), `Week ${n} long shorter than easy ${e.id}`);
    }
  }
});

test("note joins the description and the Note", () => {
  const { sessions } = derive();
  assert.equal(row(sessions, "i197510215").note, "30mins 13laps\n" + notes.entries["2026-10-15"]!.note);
  assert.equal(row(sessions, "i199861035").note, notes.entries["2026-10-21"]!.note);
  assert.equal(row(sessions, "i196348747").note, null);
});

test("a Note on a two-run day with no activity_id goes to the longest run", () => {
  const { sessions } = derive(
    fixture.runs,
    notesWith((e) => {
      e["2026-10-23"] = { note: "Two-part run." };
    }),
  );
  assert.equal(row(sessions, "i200625554").note, "Two-part run.");
  assert.equal(row(sessions, "i200612220").note, null);
});

test("a Note on a day with no run is skipped and logged", () => {
  const { log } = derive(
    fixture.runs,
    notesWith((e) => {
      e["2026-10-24"] = { note: "x" };
    }),
  );
  assert.ok(log.some((l) => l.includes("entries.2026-10-24")));
});

test("a Note whose activity_id is on another date stops derive", () => {
  const n = notesWith((e) => {
    e["2026-10-23"] = { activity_id: "i199861035" };
  });
  assert.throws(
    () => derive(fixture.runs, n),
    (err) => err instanceof DeriveError && err.message.includes("i199861035 is a run on 2026-10-21"),
  );
});

test("a Note's reps show on a run that isn't the quality session", () => {
  const { sessions } = derive(
    fixture.runs,
    notesWith((e) => {
      e["2026-10-12"] = { reps: ["0:21", "0:20"] };
    }),
  );
  const r = row(sessions, "i196348747");
  assert.equal(r.type, "easy");
  assert.deepEqual(r.reps, [
    { n: 1, time_s: 21, distance_m: null, pace_s_per_km: null, pace: null, avg_hr_bpm: null, all_out: false },
    { n: 2, time_s: 20, distance_m: null, pace_s_per_km: null, pace: null, avg_hr_bpm: null, all_out: false },
  ]);
});

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
/** `count` reps of three 465 m laps at 4:20 (121 s each), one segment per lap, 200 m jog between. */
const threeLapReps = (count: number) =>
  Array.from({ length: count }, () => [seg(465, 121), seg(465, 121), seg(465, 121), seg(200, 120)]).flat();

test("7 Oct reps come from its Note, rep 3 all-out", () => {
  assert.deepEqual(row(derive().sessions, "i194473587").reps, [
    { n: 1, time_s: 254, distance_m: 1000, pace_s_per_km: 254, pace: "4:14", avg_hr_bpm: null, all_out: false },
    { n: 2, time_s: 253, distance_m: 1000, pace_s_per_km: 253, pace: "4:13", avg_hr_bpm: null, all_out: false },
    { n: 3, time_s: 224, distance_m: 1000, pace_s_per_km: 224, pace: "3:44", avg_hr_bpm: null, all_out: true },
    { n: 4, time_s: 252, distance_m: 1000, pace_s_per_km: 252, pace: "4:12", avg_hr_bpm: null, all_out: false },
  ]);
});

test("without its Note, 7 Oct is Week 0's quality session by shape with 4 reps", () => {
  const r = row(
    derive(
      fixture.runs,
      notesWith((e) => {
        delete e["2026-10-07"];
      }),
    ).sessions,
    "i194473587",
  );
  assert.equal(r.type, "quality");
  assert.equal(r.plan_session_id, "w00-quality");
  assert.equal(r.reps.length, 4);
  assert.ok(r.reps.every((x) => x.all_out === false));
});

test("21 Oct is Week 2's quality session by shape, 5 reps against 6", () => {
  const { sessions, log } = derive();
  const r = row(sessions, "i199861035");
  assert.equal(r.type, "quality");
  assert.equal(r.plan_session_id, "w02-quality");
  assert.deepEqual(r.reps.map((x) => x.time_s), [234, 231, 243, 254, 259]);
  assert.deepEqual(r.reps[0], { n: 1, time_s: 234, distance_m: 922, pace_s_per_km: 254, pace: "4:14", avg_hr_bpm: 168, all_out: false });
  assert.ok(log.some((l) => l.includes("i199861035 w02-quality: 5 reps against 6 planned")));
});

test("a lap rep pressed one segment per lap joins into one rep", () => {
  const runs = [made("x1", "2026-10-29T18:00:00", [seg(2000, 1200), ...threeLapReps(4), seg(1500, 900)]), ...fixture.runs];
  const r = row(derive(runs).sessions, "x1");
  assert.equal(r.type, "quality");
  assert.equal(r.plan_session_id, "w03-quality");
  assert.equal(r.reps.length, 4);
  for (const x of r.reps) {
    assert.equal(x.distance_m, 1395);
    assert.equal(x.time_s, 363);
  }
});

test("a time rep uses elapsed time, auto-pause and all", () => {
  const runs = [
    made("x2", "2026-12-29T18:00:00", [seg(2000, 1200), seg(2424, 720, 690), seg(300, 180), seg(2424, 720, 690), seg(1500, 900)]),
    ...fixture.runs,
  ];
  const r = row(derive(runs).sessions, "x2");
  assert.equal(r.type, "quality");
  assert.equal(r.plan_session_id, "w12-quality");
  assert.deepEqual(r.reps.map((x) => x.time_s), [720, 720]);
});

test("every rep found is kept, more than planned too", () => {
  const runs = [made("x3", "2026-10-29T18:00:00", [seg(2000, 1200), ...threeLapReps(6), seg(1500, 900)]), ...fixture.runs];
  const { sessions, log } = derive(runs);
  assert.equal(row(sessions, "x3").reps.length, 6);
  assert.ok(log.some((l) => l.includes("x3 w03-quality: 6 reps against 4 planned")));
});

test("on test day with a separate warm-up, the run with the test's shape is the test", () => {
  const runs = [
    made("x5", "2026-12-15T07:05:00", [
      seg(2000, 1200),
      ...Array.from({ length: 5 }, () => [seg(1860, 465), seg(200, 600)]).flat(),
      seg(1000, 600),
    ]),
    made("x4", "2026-12-15T06:50:00", [seg(2500, 1500)]),
    ...fixture.runs,
  ];
  const { sessions } = derive(runs);
  const test5 = row(sessions, "x5");
  assert.equal(test5.type, "test");
  assert.equal(test5.plan_session_id, "w10-quality");
  assert.equal(test5.reps.length, 5);
  const other = row(sessions, "x4");
  assert.notEqual(other.plan_session_id, "w10-quality");
  assert.notEqual(other.type, "test");
});

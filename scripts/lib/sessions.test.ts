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

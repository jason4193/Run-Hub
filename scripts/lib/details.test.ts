import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECENT_DAYS,
  isRecent,
  intervalsFetchReason,
  toDetailInterval,
  toRunDetail,
  mergeRunDetails,
  type DetailInterval,
  type ListRun,
  type RawInterval,
  type RunDetail,
} from "./details.ts";

const TODAY = "2026-10-11";
const A = "2026-09-01T00:00:00.000+00:00";
const B = "2026-10-11T03:11:19.306+00:00";
const ZONES = [145, 153, 162, 171, 176, 181, 192];
const run = (over: Partial<ListRun> = {}): ListRun => ({
  id: "i1",
  type: "Run",
  name: "Run",
  start_date_local: "2026-09-01T07:00:00",
  distance: 5000,
  moving_time: 1500,
  average_heartrate: 150,
  max_heartrate: 170,
  icu_hr_zone_times: [1, 2, 3, 4, 5, 6, 7],
  icu_hr_zones: ZONES,
  icu_rpe: 5,
  analyzed: A,
  ...over,
});
const iv: DetailInterval = {
  type: "WORK",
  label: null,
  distance: 1000,
  moving_time: 250,
  elapsed_time: 250,
  average_heartrate: 160,
  max_heartrate: 170,
};
const stored = (over: Partial<RunDetail> = {}): RunDetail => ({ ...toRunDetail(run(), [iv], A), ...over });

test("the recent window is 14 days", () => {
  assert.equal(RECENT_DAYS, 14);
});

test("a run from Today or the 13 days before is recent; 14 days before is not", () => {
  assert.equal(isRecent("2026-10-11T06:00:00", TODAY), true);
  assert.equal(isRecent("2026-09-28T06:00:00", TODAY), true);
  assert.equal(isRecent("2026-09-27T23:59:00", TODAY), false);
});

test("a run with no stored row needs its intervals (new), even when recent", () => {
  assert.equal(intervalsFetchReason(run(), undefined, TODAY), "new");
  assert.equal(intervalsFetchReason(run({ start_date_local: "2026-10-10T07:00:00" }), undefined, TODAY), "new");
});

test("a stored row with null intervals needs them again (new)", () => {
  assert.equal(intervalsFetchReason(run(), stored({ icu_intervals: null, analyzed: null }), TODAY), "new");
});

test("a moved analyzed time means the run was edited", () => {
  assert.equal(intervalsFetchReason(run({ analyzed: B }), stored(), TODAY), "edited");
  assert.equal(intervalsFetchReason(run({ analyzed: undefined }), stored(), TODAY), "edited");
});

test("an unchanged recent run is fetched again (recent)", () => {
  assert.equal(intervalsFetchReason(run({ start_date_local: "2026-10-05T07:00:00" }), stored(), TODAY), "recent");
});

test("an unchanged run older than 14 days is not fetched", () => {
  assert.equal(intervalsFetchReason(run(), stored(), TODAY), null);
});

test("a row keeps intervals.icu names and only the agreed fields", () => {
  const raw = {
    ...run({
      id: "i194473587",
      start_date_local: "2026-10-07T07:59:14",
      distance: 11359.5,
      moving_time: 4370,
      average_heartrate: 153,
      max_heartrate: 179,
      icu_hr_zone_times: [1452, 859, 487, 915, 436, 175, 0],
      icu_rpe: 6,
      description: "4 x 1km intervals with warmup & cooldown",
      analyzed: B,
    }),
    pace: 2.599428,
    session_rpe: 437,
    icu_lap_count: 9,
  } as ListRun;
  assert.deepEqual(toRunDetail(raw, [iv], B), {
    id: "i194473587",
    start_date_local: "2026-10-07T07:59:14",
    type: "Run",
    name: "Run",
    distance: 11359.5,
    moving_time: 4370,
    average_heartrate: 153,
    max_heartrate: 179,
    icu_hr_zone_times: [1452, 859, 487, 915, 436, 175, 0],
    icu_hr_zones: ZONES,
    icu_rpe: 6,
    feel: null,
    description: "4 x 1km intervals with warmup & cooldown",
    analyzed: B,
    icu_intervals: [iv],
  });
});

test("no HR, no RPE, no feel and blank text are null, never 0 or empty", () => {
  const row = toRunDetail(
    run({
      average_heartrate: undefined,
      max_heartrate: undefined,
      icu_hr_zone_times: undefined,
      icu_rpe: undefined,
      name: "",
      description: "",
    }),
    [],
    A,
  );
  assert.equal(row.average_heartrate, null);
  assert.equal(row.max_heartrate, null);
  assert.equal(row.icu_hr_zone_times, null);
  assert.equal(row.icu_rpe, null);
  assert.equal(row.feel, null);
  assert.equal(row.name, null);
  assert.equal(row.description, null);
});

test("feel is stored as intervals.icu's number", () => {
  assert.equal(toRunDetail(run({ feel: 2 }), [], A).feel, 2);
});

test("an interval keeps only the agreed fields, blank label and missing HR as null", () => {
  const raw = {
    type: "WORK",
    label: "",
    distance: 1007.1,
    moving_time: 225,
    elapsed_time: 225,
    max_heartrate: 177,
    average_speed: 4.476,
    intensity: 97,
    group_id: "225s@167bpm100rpm",
  } as RawInterval;
  assert.deepEqual(toDetailInterval(raw), {
    type: "WORK",
    label: null,
    distance: 1007.1,
    moving_time: 225,
    elapsed_time: 225,
    average_heartrate: null,
    max_heartrate: 177,
  });
});

test("a fetched run takes the new intervals and the list's analyzed time", () => {
  const fresh: DetailInterval = { ...iv, moving_time: 240 };
  const [row] = mergeRunDetails([run({ analyzed: B })], new Map([["i1", stored()]]), new Map([["i1", [fresh]]]));
  assert.deepEqual(row.icu_intervals, [fresh]);
  assert.equal(row.analyzed, B);
});

test("a failed fetch keeps the stored intervals and analyzed time, but list fields refresh", () => {
  const [row] = mergeRunDetails(
    [run({ analyzed: B, icu_rpe: 7, description: "late note" })],
    new Map([["i1", stored()]]),
    new Map(),
  );
  assert.deepEqual(row.icu_intervals, [iv]);
  assert.equal(row.analyzed, A);
  assert.equal(row.icu_rpe, 7);
  assert.equal(row.description, "late note");
  // still edited next Sync, so it is retried
  assert.equal(intervalsFetchReason(run({ analyzed: B }), row, TODAY), "edited");
});

test("a new run whose fetch failed is still written, with null intervals and analyzed, and retried", () => {
  const [row] = mergeRunDetails([run()], new Map(), new Map());
  assert.equal(row.icu_intervals, null);
  assert.equal(row.analyzed, null);
  assert.equal(row.average_heartrate, 150);
  assert.equal(intervalsFetchReason(run(), row, TODAY), "new");
});

test("a fetch with no detected intervals stores [], and an old run is then left alone", () => {
  const [row] = mergeRunDetails([run()], new Map(), new Map([["i1", []]]));
  assert.deepEqual(row.icu_intervals, []);
  assert.equal(row.analyzed, A);
  assert.equal(intervalsFetchReason(run(), row, TODAY), null);
});

test("runs deleted upstream drop out and rows sort newest first", () => {
  const prior = new Map([["gone", stored({ id: "gone" })]]);
  const rows = mergeRunDetails(
    [run({ id: "a", start_date_local: "2026-09-01T07:00:00" }), run({ id: "b", start_date_local: "2026-10-01T07:00:00" })],
    prior,
    new Map([
      ["a", [iv]],
      ["b", [iv]],
    ]),
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["b", "a"],
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { sydneyToday } from "./dates.ts";

test("a Sydney-morning run is still the same Sydney day when UTC is the day before", () => {
  // the 7 Oct run started 07:59 Sydney = 20:59 UTC on 6 Oct
  assert.equal(sydneyToday(new Date("2026-10-06T20:59:14Z")), "2026-10-07");
});

test("the day turns at Sydney midnight in daylight time (UTC+11)", () => {
  assert.equal(sydneyToday(new Date("2026-10-07T12:59:59Z")), "2026-10-07");
  assert.equal(sydneyToday(new Date("2026-10-07T13:00:00Z")), "2026-10-08");
});

test("the day turns at Sydney midnight in standard time (UTC+10)", () => {
  assert.equal(sydneyToday(new Date("2026-06-30T13:59:59Z")), "2026-06-30");
  assert.equal(sydneyToday(new Date("2026-06-30T14:00:00Z")), "2026-07-01");
});

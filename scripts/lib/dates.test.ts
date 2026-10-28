import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, isMonday, sydneyToday } from "./dates.ts";

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

test("addDays crosses months, years and Sydney's daylight-saving change as plain calendar days", () => {
  assert.equal(addDays("2026-10-05", 6), "2026-10-11");
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
  assert.equal(addDays("2026-10-01", 7), "2026-10-08"); // DST starts 4 Oct 2026 in Sydney
  assert.equal(addDays("2026-10-05", 146), "2027-02-28");
});

test("daysBetween counts whole calendar days and goes negative backwards", () => {
  assert.equal(daysBetween("2026-10-05", "2027-02-28"), 146);
  assert.equal(daysBetween("2026-10-05", "2026-10-04"), -1);
});

test("isMonday is true only for Mondays", () => {
  assert.equal(isMonday("2026-10-05"), true);
  assert.equal(isMonday("2026-10-06"), false);
  assert.equal(isMonday("2026-10-11"), false);
});

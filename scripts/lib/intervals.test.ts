import { test } from "node:test";
import assert from "node:assert/strict";
import { activityListPath, paceCurvePath } from "./intervals.ts";

test("activity list path has oldest + fields and no newest", () => {
  const p = activityListPath("i12345", "id,name");
  assert.equal(p, "/api/v1/athlete/i12345/activities?oldest=2000-01-01&fields=id%2Cname");
  assert.doesNotMatch(p, /newest=/);
});

test("pace curve path has type=Run and no newest", () => {
  assert.equal(paceCurvePath("i12345", false), "/api/v1/athlete/i12345/pace-curves.json?type=Run");
  assert.equal(paceCurvePath("i12345", true), "/api/v1/athlete/i12345/pace-curves.json?type=Run&gap=true");
  assert.doesNotMatch(paceCurvePath("i12345", true), /newest=/);
});

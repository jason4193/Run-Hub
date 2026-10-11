import { test } from "node:test";
import assert from "node:assert/strict";
import { activityListPath, paceCurvePath, describeListFailure, asErrorAnnotation, SyncError } from "./intervals.ts";

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

test("describeListFailure translates each failure", () => {
  assert.equal(describeListFailure({ status: 401 }), "INTERVALS_API_KEY rejected by intervals.icu (401) — rotate the secret");
  assert.equal(describeListFailure({ status: 403 }), "INTERVALS_API_KEY rejected by intervals.icu (403) — rotate the secret");
  assert.equal(describeListFailure({ status: 404 }), "Athlete not found (404) — check INTERVALS_ATHLETE_ID");
  assert.equal(describeListFailure({ status: 503 }), "intervals.icu unavailable (503) — will retry on next scheduled run");
  assert.equal(
    describeListFailure({ networkError: "fetch failed" }),
    "intervals.icu unavailable (network error: fetch failed) — will retry on next scheduled run",
  );
  assert.equal(describeListFailure({ status: 400 }), "intervals.icu activity list failed (400)");
});

test("asErrorAnnotation only annotates in CI", () => {
  assert.equal(asErrorAnnotation("boom", true), "::error title=Sync failed::boom");
  assert.equal(asErrorAnnotation("boom", false), "boom");
});

test("SyncError is an Error carrying the message", () => {
  const e = new SyncError("x");
  assert.ok(e instanceof Error);
  assert.equal(e.message, "x");
});

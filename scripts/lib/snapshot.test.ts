import { test } from "node:test";
import assert from "node:assert/strict";
import { HEARTBEAT_HOURS, shouldWriteSnapshot } from "./snapshot.ts";

const NOW = "2026-10-09T00:00:00.000Z";
const hoursBefore = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();
const acts = (generatedAt: string, extra: object = {}) => ({ schemaVersion: 1, generatedAt, activities: [{ id: "a1", distance: 5000 }], ...extra });
const pace = (generatedAt: string) => ({ schemaVersion: 1, generatedAt, pace: [], gap: [] });

test("heartbeat window is 20 hours", () => {
  assert.equal(HEARTBEAT_HOURS, 20);
});

test("first run (no prior files) writes", () => {
  assert.equal(shouldWriteSnapshot(null, { activities: acts(NOW), pace: pace(NOW) }, NOW), true);
});

test("unchanged content with a 2 h old timestamp does not write", () => {
  const prior = { activities: acts(hoursBefore(2)), pace: pace(hoursBefore(2)) };
  assert.equal(shouldWriteSnapshot(prior, { activities: acts(NOW), pace: pace(NOW) }, NOW), false);
});

test("unchanged content with a 21 h old timestamp writes (daily heartbeat)", () => {
  const prior = { activities: acts(hoursBefore(21)), pace: pace(hoursBefore(21)) };
  assert.equal(shouldWriteSnapshot(prior, { activities: acts(NOW), pace: pace(NOW) }, NOW), true);
});

test("exactly 20 h old counts as stale and writes", () => {
  const prior = { activities: acts(hoursBefore(20)), pace: pace(hoursBefore(20)) };
  assert.equal(shouldWriteSnapshot(prior, { activities: acts(NOW), pace: pace(NOW) }, NOW), true);
});

test("changed activities write even when the timestamp is fresh", () => {
  const prior = { activities: acts(hoursBefore(1)), pace: pace(hoursBefore(1)) };
  const next = { activities: acts(NOW, { activities: [{ id: "a1", distance: 5000 }, { id: "a2", distance: 8000 }] }), pace: pace(NOW) };
  assert.equal(shouldWriteSnapshot(prior, next, NOW), true);
});

test("changed pace curve writes even when the timestamp is fresh", () => {
  const prior = { activities: acts(hoursBefore(1)), pace: pace(hoursBefore(1)) };
  const changedPace = { ...pace(NOW), pace: [{ distance: 1000 }] };
  const next = { activities: acts(NOW), pace: changedPace };
  assert.equal(shouldWriteSnapshot(prior, next, NOW), true);
});

test("undefined fields are ignored like JSON.stringify ignores them", () => {
  const prior = { activities: acts(hoursBefore(1)), pace: pace(hoursBefore(1)) };
  const withUndefined = { ...acts(NOW), activities: [{ id: "a1", distance: 5000, bounds: undefined }] };
  const next = { activities: withUndefined, pace: pace(NOW) };
  assert.equal(shouldWriteSnapshot(prior, next, NOW), false);
});

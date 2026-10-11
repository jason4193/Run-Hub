import { test } from "node:test";
import assert from "node:assert/strict";
import { HEARTBEAT_HOURS, shouldWriteSnapshot } from "./snapshot.ts";

const NOW = "2026-10-09T00:00:00.000Z";
const hoursBefore = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();
const acts = (generatedAt: string, extra: object = {}) => ({ schemaVersion: 1, generatedAt, activities: [{ id: "a1", distance: 5000 }], ...extra });
const pace = (generatedAt: string) => ({ schemaVersion: 1, generatedAt, pace: [], gap: [] });
const details = (generatedAt: string, runs: object[] = [{ id: "a1", icu_rpe: 5 }]) => ({ schemaVersion: 1, generatedAt, runs });
const files = (generatedAt: string) => ({ activities: acts(generatedAt), pace: pace(generatedAt), details: details(generatedAt) });

test("heartbeat window is 20 hours", () => {
  assert.equal(HEARTBEAT_HOURS, 20);
});

test("first run (no prior files) writes", () => {
  assert.equal(shouldWriteSnapshot(null, files(NOW), NOW), true);
});

test("unchanged content with a 2 h old timestamp does not write", () => {
  assert.equal(shouldWriteSnapshot(files(hoursBefore(2)), files(NOW), NOW), false);
});

test("unchanged content with a 21 h old timestamp writes (daily heartbeat)", () => {
  assert.equal(shouldWriteSnapshot(files(hoursBefore(21)), files(NOW), NOW), true);
});

test("exactly 20 h old counts as stale and writes", () => {
  assert.equal(shouldWriteSnapshot(files(hoursBefore(20)), files(NOW), NOW), true);
});

test("changed activities write even when the timestamp is fresh", () => {
  const next = { ...files(NOW), activities: acts(NOW, { activities: [{ id: "a1", distance: 5000 }, { id: "a2", distance: 8000 }] }) };
  assert.equal(shouldWriteSnapshot(files(hoursBefore(1)), next, NOW), true);
});

test("changed pace curve writes even when the timestamp is fresh", () => {
  const next = { ...files(NOW), pace: { ...pace(NOW), pace: [{ distance: 1000 }] } };
  assert.equal(shouldWriteSnapshot(files(hoursBefore(1)), next, NOW), true);
});

test("changed run details write even when the timestamp is fresh (an RPE edited after the run)", () => {
  const next = { ...files(NOW), details: details(NOW, [{ id: "a1", icu_rpe: 7 }]) };
  assert.equal(shouldWriteSnapshot(files(hoursBefore(1)), next, NOW), true);
});

test("undefined fields are ignored like JSON.stringify ignores them", () => {
  const withUndefined = { ...acts(NOW), activities: [{ id: "a1", distance: 5000, bounds: undefined }] };
  const next = { ...files(NOW), activities: withUndefined };
  assert.equal(shouldWriteSnapshot(files(hoursBefore(1)), next, NOW), false);
});

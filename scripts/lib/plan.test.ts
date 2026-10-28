import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPlan, parsePlan, PlanError } from "./plan.ts";
import { fixtureYaml } from "./plan-fixture.ts";
import { lapRange, resolvePace } from "./plan-view.ts";

const FILE = "training/plan.yaml";

/** Asserts parsing the edited fixture throws a PlanError whose message contains `expected`. */
function rejects(edit: Parameters<typeof fixtureYaml>[0], expected: string) {
  assert.throws(
    () => parsePlan(fixtureYaml(edit), FILE),
    (e: unknown) => e instanceof PlanError && e.message.includes(expected),
  );
}

test("the committed training/plan.yaml passes the format check", async () => {
  const plan = await loadPlan();
  assert.ok(plan.weeks.length > 0);
});

test("the committed Plan's threshold sessions resolve to 4:57 from the Week 1 time trial", async () => {
  const plan = await loadPlan();
  const w11 = plan.weeks[11].quality;
  assert.notEqual(w11, "test");
  const pace = resolvePace(plan, (w11 as Exclude<typeof w11, "test">).pace);
  assert.equal(pace, "4:57");
  assert.deepEqual(lapRange(plan, pace!), [134, 143]);
});

test("a valid Plan parses, with flag null and notes [] where the file leaves them out", () => {
  const plan = parsePlan(fixtureYaml(), FILE);
  assert.equal(plan.weeks[0].flag, null);
  assert.deepEqual(plan.weeks[0].notes, []);
  assert.equal(plan.weeks[1].flag, "taper");
});

test("changing values keeps the Plan valid", () => {
  const plan = parsePlan(
    fixtureYaml((p) => {
      p.weeks[0].km = 40;
      p.weeks[0].quality.pace = "4:20";
      p.goals.four_lap.pace = "4:15";
      p.goals.four_lap.date = "2026-10-15";
    }),
    FILE,
  );
  assert.equal(plan.weeks[0].km, 40);
});

test("a Bagels Run is optional and parses when given", () => {
  assert.equal(parsePlan(fixtureYaml(), FILE).block.bagels_run, undefined);
  const plan = parsePlan(
    fixtureYaml(
      (p) =>
        (p.block.bagels_run = { weekday: "Tue", distance_km: 8, effort: "moderate", from: "2026-10-20", note: "Run club." }),
    ),
    FILE,
  );
  assert.equal(plan.block.bagels_run?.weekday, "Tue");
});

test("a Bagels Run on an unknown weekday fails, naming the key", () => {
  rejects(
    (p) =>
      (p.block.bagels_run = { weekday: "Tues", distance_km: 8, effort: "moderate", from: "2026-10-20", note: "Run club." }),
    `${FILE}: block.bagels_run.weekday: `,
  );
});

test("a quality target needs exactly one of laps_per_rep, distance_m, duration_s", () => {
  const msg = `${FILE}: weeks[0].quality: needs exactly one of laps_per_rep, distance_m, duration_s`;
  rejects((p) => (p.weeks[0].quality.duration_s = 600), msg);
  rejects((p) => delete p.weeks[0].quality.distance_m, msg);
});

test("an unknown key fails, naming where it is", () => {
  rejects((p) => (p.weeks[0].quality.laps = 2), `${FILE}: weeks[0].quality`);
  rejects((p) => (p.block.hr_cap_bpm = 155), `${FILE}: block`);
});

test("a pace outside its allowed forms fails", () => {
  rejects((p) => (p.weeks[0].quality.pace = "fast"), `${FILE}: weeks[0].quality`);
  rejects((p) => (p.weeks[0].long.pace = "4:7"), `${FILE}: weeks[0].long`);
  rejects((p) => (p.goals.four_lap.pace = 250), `${FILE}: goals.four_lap.pace`);
});

test("a date that doesn't exist fails", () => {
  rejects((p) => (p.goals.osaka.date = "2026-02-30"), `${FILE}: goals.osaka.date: must be a real date`);
});

test("each week's n must match its position", () => {
  rejects((p) => (p.weeks[1].n = 2), `${FILE}: weeks[1].n: must be 1 (weeks are listed in order from 0)`);
});

test("runs min must not exceed max", () => {
  rejects((p) => (p.weeks[0].runs = [5, 4]), `${FILE}: weeks[0].runs: min must not exceed max`);
});

test("the block must start on a Monday", () => {
  rejects((p) => (p.block.start = "2026-10-06"), `${FILE}: block.start: must be a Monday`);
});

test("exactly one test week and one race week", () => {
  rejects((p) => (p.weeks[2].quality = "test"), `${FILE}: weeks: needs exactly one week with quality: test (found 2)`);
  rejects(
    (p) => (p.weeks[1].quality = { reps: 1, duration_s: 600, pace: "threshold" }),
    `${FILE}: weeks: needs exactly one week with quality: test (found 0)`,
  );
  rejects((p) => (p.weeks[1].long = "race"), `${FILE}: weeks: needs exactly one week with long: race (found 2)`);
});

test("each goal's date falls inside its week", () => {
  rejects(
    (p) => (p.goals.four_lap.date = "2026-10-20"),
    `${FILE}: goals.four_lap.date: must fall inside Week 1 (2026-10-12 to 2026-10-18), the week with quality: test`,
  );
  rejects(
    (p) => (p.goals.osaka.date = "2026-10-26"),
    `${FILE}: goals.osaka.date: must fall inside Week 2 (2026-10-19 to 2026-10-25), the week with long: race`,
  );
});

test("a checkpoint must point at a week that exists", () => {
  rejects((p) => (p.checkpoints.A.week = 3), `${FILE}: checkpoints.A.week: no Week 3 in weeks`);
});

test("phases start at Week 0 and go up", () => {
  rejects((p) => (p.phases[0].from_week = 1), `${FILE}: phases[0].from_week: must be 0`);
  rejects((p) => (p.phases[1].from_week = 0), `${FILE}: phases[1].from_week: must be greater than phases[0].from_week`);
});

test("a YAML syntax error names the file", () => {
  assert.throws(
    () => parsePlan("weeks: [", FILE),
    (e: unknown) => e instanceof PlanError && e.message.startsWith(`${FILE}: `),
  );
});

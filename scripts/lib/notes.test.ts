import { test } from "node:test";
import assert from "node:assert/strict";
import { stringify } from "yaml";
import { loadPlan, parsePlan } from "./plan.ts";
import { fixtureYaml } from "./plan-fixture.ts";
import { loadNotes, NotesError, parseNotes } from "./notes.ts";

const FILE = "training/notes.yaml";
const plan = parsePlan(fixtureYaml(), "fixture.yaml");

/** A small valid notes file on the fixture Plan (Week 0 is 5–11 Oct), after `edit` breaks one key. */
function notesYaml(edit?: (notes: any) => void): string {
  const notes: any = {
    entries: {
      "2026-10-07": { session: "w00-quality", reps: ["4:14", "4:13", "3:44", "4:12"], all_out: [3], note: "Rep 3 all-out." },
      "2026-10-15": { activity_id: "i197510215", note: "Time trial." },
    },
    gaps: [{ from: "2026-12-24", to: "2026-12-27", note: "Watch left at home." }],
  };
  edit?.(notes);
  return stringify(notes);
}

function rejects(edit: (notes: any) => void, expected: string) {
  assert.throws(
    () => parseNotes(notesYaml(edit), FILE, plan),
    (e: unknown) => e instanceof NotesError && e.message.includes(expected),
  );
}

test("the committed training/notes.yaml passes against the committed Plan", async () => {
  const notes = await loadNotes(await loadPlan());
  assert.equal(notes.entries["2026-10-07"].session, "w00-quality");
});

test("valid notes parse, every field optional, gaps [] when left out", () => {
  const notes = parseNotes(notesYaml(), FILE, plan);
  assert.deepEqual(notes.entries["2026-10-07"].all_out, [3]);
  assert.equal(notes.entries["2026-10-15"].session, undefined);
  assert.deepEqual(parseNotes(notesYaml((n) => delete n.gaps), FILE, plan).gaps, []);
});

test("an entry needs at least one field", () => {
  rejects((n) => (n.entries["2026-10-08"] = {}), `${FILE}: entries.2026-10-08: needs at least one field`);
});

test("a date key that isn't a real date fails", () => {
  rejects((n) => (n.entries["2026-10-32"] = { note: "x" }), `${FILE}: entries.2026-10-32`);
  rejects((n) => (n.entries["7 Oct"] = { note: "x" }), `${FILE}: entries.7 Oct`);
});

test("an unknown key fails, naming where it is", () => {
  rejects((n) => (n.entries["2026-10-07"].rpe = 7), `${FILE}: entries.2026-10-07`);
});

test("a session the Plan doesn't have fails", () => {
  rejects(
    (n) => (n.entries["2026-10-07"].session = "w09-quality"),
    `${FILE}: entries.2026-10-07.session: w09-quality is not in training/plan.yaml`,
  );
  rejects(
    (n) => (n.entries["2026-10-07"].session = "quality"),
    `${FILE}: entries.2026-10-07.session: must be a session id like w04-quality or w04-long`,
  );
});

test("a session must belong to the week of its date", () => {
  rejects(
    (n) => (n.entries["2026-10-14"] = { session: "w00-long" }),
    `${FILE}: entries.2026-10-14.session: w00-long is in Week 0 (2026-10-05 to 2026-10-11), not the week of 2026-10-14`,
  );
});

test("reps must be m:ss times", () => {
  rejects((n) => (n.entries["2026-10-07"].reps = ["4.14"]), `${FILE}: entries.2026-10-07.reps[0]`);
  rejects((n) => (n.entries["2026-10-07"].reps = [254]), `${FILE}: entries.2026-10-07.reps[0]`);
});

test("all_out must name reps listed in reps", () => {
  rejects((n) => (n.entries["2026-10-07"].all_out = [5]), `${FILE}: entries.2026-10-07.all_out: 5 is not a rep in reps (1–4)`);
  rejects((n) => delete n.entries["2026-10-07"].reps, `${FILE}: entries.2026-10-07.all_out: 3 is not a rep in reps (none)`);
});

test("a YAML syntax error names the file", () => {
  assert.throws(
    () => parseNotes("entries: [", FILE, plan),
    (e: unknown) => e instanceof NotesError && e.message.startsWith(`${FILE}: `),
  );
});

/**
 * The notes (training/notes.yaml): the Athlete's optional additions to the log, keyed by date. Nothing
 * depends on an entry being there; #7 reads them when they are. Checked against the Plan, so a note on
 * a session a later Change Brief removes fails loudly instead of vanishing.
 * Any failure throws a NotesError naming the file and the key, e.g. `training/notes.yaml: entries.2026-10-07.session: …`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { formatPath, isoDate, type Plan } from "./plan.ts";
import { weekEnd, weekOf, weekStart } from "./plan-view.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const NOTES_FILE = path.join(ROOT, "training", "notes.yaml");
const NOTES_LABEL = "training/notes.yaml";
const PLAN_LABEL = "training/plan.yaml";

const repTime = z.string().regex(/^\d{1,2}:[0-5]\d$/, 'must be a quoted "m:ss" time');

const entrySchema = z
  .strictObject({
    activity_id: z.string().min(1).optional(),
    session: z.string().regex(/^w\d{2}-(quality|long)$/, "must be a session id like w04-quality or w04-long").optional(),
    reps: z.array(repTime).min(1).optional(),
    all_out: z.array(z.number().int().positive()).min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .refine((e) => Object.keys(e).length > 0, "needs at least one field");

const notesSchema = z.strictObject({
  entries: z.record(isoDate, entrySchema).default({}),
  gaps: z.array(z.strictObject({ from: isoDate, to: isoDate, note: z.string().min(1) })).default([]),
});

export type Notes = z.infer<typeof notesSchema>;
export type NoteEntry = Notes["entries"][string];

export class NotesError extends Error {
  override name = "NotesError";
}

/** Checks against the Plan. Returns one `path: message` per problem; empty when the notes are sound. */
export function checkNotes(notes: Notes, plan: Plan): string[] {
  const problems: string[] = [];
  for (const [date, entry] of Object.entries(notes.entries)) {
    const at = `entries.${date}`;
    if (entry.session !== undefined) {
      const n = Number(entry.session.slice(1, 3));
      if (n >= plan.weeks.length) {
        problems.push(`${at}.session: ${entry.session} is not in ${PLAN_LABEL}`);
      } else if (weekOf(plan, date) !== n) {
        problems.push(
          `${at}.session: ${entry.session} is in Week ${n} (${weekStart(plan, n)} to ${weekEnd(plan, n)}), not the week of ${date}`,
        );
      }
    }
    const reps = entry.reps?.length ?? 0;
    for (const rep of entry.all_out ?? []) {
      if (rep > reps) problems.push(`${at}.all_out: ${rep} is not a rep in reps (${reps > 0 ? `1–${reps}` : "none"})`);
    }
  }
  return problems;
}

/** Parse and check notes YAML against the Plan. `file` only labels error messages. Throws NotesError on any problem. */
export function parseNotes(text: string, file: string, plan: Plan): Notes {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new NotesError(`${file}: ${(e as Error).message}`);
  }
  const result = notesSchema.safeParse(raw);
  if (!result.success) {
    throw new NotesError(result.error.issues.map((i) => `${file}: ${formatPath(i.path)}: ${i.message}`).join("\n"));
  }
  const problems = checkNotes(result.data, plan);
  if (problems.length > 0) throw new NotesError(problems.map((p) => `${file}: ${p}`).join("\n"));
  return result.data;
}

/** Read and check the committed `training/notes.yaml` against the Plan. */
export async function loadNotes(plan: Plan): Promise<Notes> {
  return parseNotes(await fs.readFile(NOTES_FILE, "utf8"), NOTES_LABEL, plan);
}

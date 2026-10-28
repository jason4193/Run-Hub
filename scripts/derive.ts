/**
 * Derive (#7): build the Outputs in data/training/ from the Snapshot's Run Details and the Inputs.
 * Offline and pure: no network and no clock. `generatedAt` is copied from run-details.json, so the
 * same inputs give the same bytes and the Heartbeat holds. Logs go to the Action log only.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunDetailsSnapshot } from "./lib/details.ts";
import { asErrorAnnotation } from "./lib/intervals.ts";
import { loadNotes, NotesError } from "./lib/notes.ts";
import { loadPlan, PlanError } from "./lib/plan.ts";
import { DeriveError, deriveSessions } from "./lib/sessions.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DETAILS_FILE = path.join(ROOT, "data", "run-details.json");
const OUT_DIR = path.join(ROOT, "data", "training");
const SESSIONS_FILE = path.join(OUT_DIR, "sessions.json");

async function writeTextAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, file);
}

async function main() {
  const details = JSON.parse(await fs.readFile(DETAILS_FILE, "utf8")) as RunDetailsSnapshot;
  const plan = await loadPlan();
  const notes = await loadNotes(plan);
  const { sessions, log } = deriveSessions(details.runs, plan, notes);
  for (const line of log) console.log(line);
  const text = JSON.stringify({ schemaVersion: 1, generatedAt: details.generatedAt, sessions }, null, 2) + "\n";
  await fs.mkdir(OUT_DIR, { recursive: true });
  await writeTextAtomic(SESSIONS_FILE, text);
  console.log(`Wrote ${sessions.length} sessions to data/training/sessions.json (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB).`);
}

main().catch((e) => {
  if (e instanceof PlanError || e instanceof NotesError || e instanceof DeriveError) {
    console.error(asErrorAnnotation(e.message, process.env.GITHUB_ACTIONS === "true"));
  } else {
    console.error("Derive failed:", e);
  }
  process.exit(1);
});

/**
 * Derive (#7, #8): build the Outputs in data/training/ from the Snapshot's Run Details and the Inputs.
 * Offline and pure: no network and no clock. `generatedAt` is copied from run-details.json, so the
 * same inputs give the same bytes and the Heartbeat holds. Logs go to the Action log only.
 * --today YYYY-MM-DD derives as that Sydney date: runs starting after it, and Notes dated after it, are left out.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunDetailsSnapshot } from "./lib/details.ts";
import { sydneyToday } from "./lib/dates.ts";
import { asErrorAnnotation } from "./lib/intervals.ts";
import { loadNotes, NotesError } from "./lib/notes.ts";
import { loadPlan, PlanError } from "./lib/plan.ts";
import { DeriveError, deriveSessions } from "./lib/sessions.ts";
import { deriveStatus, statusText, type PaceCurve } from "./lib/status.ts";
import { deriveWeeks } from "./lib/weeks.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DETAILS_FILE = path.join(ROOT, "data", "run-details.json");
const OUT_DIR = path.join(ROOT, "data", "training");
const SESSIONS_FILE = path.join(OUT_DIR, "sessions.json");
const WEEKS_FILE = path.join(OUT_DIR, "weeks.json");
const STATUS_FILE = path.join(OUT_DIR, "status.json");
const PLAN_OUT_FILE = path.join(OUT_DIR, "plan.json");
const PACE_CURVE_FILE = path.join(ROOT, "data", "pace-curve.json");

async function writeTextAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, file);
}

async function main() {
  const details = JSON.parse(await fs.readFile(DETAILS_FILE, "utf8")) as RunDetailsSnapshot;
  const plan = await loadPlan();
  const notes = await loadNotes(plan);
  const i = process.argv.indexOf("--today");
  const arg = i === -1 ? undefined : process.argv[i + 1];
  if (i !== -1 && (arg === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(arg))) throw new DeriveError("--today needs a date as YYYY-MM-DD");
  // Today is the Snapshot's own date, not the clock's, so the same inputs still give the same bytes.
  const today = arg ?? sydneyToday(new Date(details.generatedAt));
  const runs = details.runs.filter((r) => r.start_date_local === null || r.start_date_local.slice(0, 10) <= today);
  const notesCut = { ...notes, entries: Object.fromEntries(Object.entries(notes.entries).filter(([date]) => date <= today)) };
  const { sessions, log } = deriveSessions(runs, plan, notesCut, today);
  for (const line of log) console.log(line);
  const weeks = deriveWeeks(sessions, runs, plan, today);
  const paceCurve = JSON.parse(await fs.readFile(PACE_CURVE_FILE, "utf8")) as PaceCurve;
  const status = deriveStatus(weeks, sessions, plan, paceCurve, today, details.generatedAt);
  const kb = (text: string) => (Buffer.byteLength(text) / 1024).toFixed(1);

  const sessionsText = JSON.stringify({ schemaVersion: 1, generatedAt: details.generatedAt, sessions }, null, 2) + "\n";
  const weeksText = JSON.stringify({ schemaVersion: 1, generatedAt: details.generatedAt, weeks }, null, 2) + "\n";
  const statusOut = statusText(status);
  const planText = JSON.stringify(plan, null, 2) + "\n";
  await fs.mkdir(OUT_DIR, { recursive: true });
  await writeTextAtomic(SESSIONS_FILE, sessionsText);
  await writeTextAtomic(WEEKS_FILE, weeksText);
  await writeTextAtomic(STATUS_FILE, statusOut);
  await writeTextAtomic(PLAN_OUT_FILE, planText);
  console.log(`Wrote ${sessions.length} sessions to data/training/sessions.json (${kb(sessionsText)} KB).`);
  console.log(`Wrote ${weeks.length} weeks to data/training/weeks.json (${kb(weeksText)} KB).`);
  console.log(`Wrote data/training/status.json (${kb(statusOut)} KB).`);
  console.log(`Wrote data/training/plan.json (${kb(planText)} KB).`);
  for (const f of status.flags) console.log(`Flag W${f.week} ${f.kind}: ${f.text}`);
}

main().catch((e) => {
  if (e instanceof PlanError || e instanceof NotesError || e instanceof DeriveError) {
    console.error(asErrorAnnotation(e.message, process.env.GITHUB_ACTIONS === "true"));
  } else {
    console.error("Derive failed:", e);
  }
  process.exit(1);
});

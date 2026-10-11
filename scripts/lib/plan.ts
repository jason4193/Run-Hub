/**
 * The Plan (docs/CONTEXT.md): read `training/plan.yaml` and check its format — never its values.
 * Two steps: the zod schema checks shapes, then checkPlan() checks what spans several keys.
 * Any failure throws a PlanError naming the file and the key, e.g. `training/plan.yaml: weeks[4].quality: …`.
 * Computed facts (week dates, session ids, session text) live in lib/plan-view.ts. See ADR 0003.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { addDays, daysBetween, isMonday } from "./dates.ts";
import { weekEnd, weekStart } from "./plan-view.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PLAN_FILE = path.join(ROOT, "training", "plan.yaml");
const PLAN_LABEL = "training/plan.yaml";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a quoted "YYYY-MM-DD" date')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && addDays(s, 0) === s, "must be a real date");
const clock = z.string().regex(/^\d{2}:\d{2}$/, 'must be a quoted "HH:MM" time');
const pace = z.string().regex(/^\d{1,2}:[0-5]\d$/, 'must be a quoted "m:ss" pace');
const count = z.number().int().positive();
const whole = z.number().int().nonnegative();

const qualityPaceSchema = z.union([pace, z.enum(["threshold", "test", "max_even"])]);
const longPaceSchema = z.union([z.literal("easy"), pace, z.tuple([pace, pace])]);
const qualityTargetSchema = z.strictObject({
  reps: count,
  laps_per_rep: count.optional(),
  distance_m: count.optional(),
  duration_s: count.optional(),
  pace: qualityPaceSchema,
  rest_s: count.optional(),
});
const longTargetSchema = z.strictObject({ distance_km: z.number().positive(), pace: longPaceSchema });

const weekSchema = z.strictObject({
  n: whole,
  km: z.number().positive(),
  runs: z.tuple([whole, whole]),
  strength: whole,
  flag: z.enum(["down", "taper"]).nullable().default(null),
  quality: z.union([z.literal("test"), qualityTargetSchema]),
  long: z.union([z.literal("race"), longTargetSchema]),
  notes: z.array(z.string().min(1)).default([]),
});

const planSchema = z.strictObject({
  block: z.strictObject({
    start: isoDate,
    lap_m: z.tuple([count, count]),
    hr_cap: z.array(z.strictObject({ from: isoDate, bpm: count, reason: z.string().min(1) })).min(1),
    threshold: z.strictObject({ pace: pace.nullable(), hr_bpm: count.nullable(), measured_at: isoDate.nullable() }),
  }),
  goals: z.strictObject({
    four_lap: z.strictObject({
      date: isoDate,
      reps: count,
      laps_per_rep: count,
      rest_s: count,
      max_spread_s: count,
      original_pace: pace,
      pace,
      pace_status: z.enum(["working", "confirmed", "revised"]),
      pace_rule: z.string().min(1),
    }),
    osaka: z.strictObject({
      date: isoDate,
      start: clock,
      limit_h: z.number().positive(),
      distance_km: z.number().positive(),
      pace,
      best_case_pace: pace,
      note: z.string(),
    }),
  }),
  phases: z.array(z.strictObject({ name: z.string().min(1), from_week: whole, note: z.string() })).min(1),
  weeks: z.array(weekSchema).min(1),
  checkpoints: z.record(
    z.string(),
    z.strictObject({
      week: whole,
      pass: z.string().min(1),
      fail: z.string().min(1),
      verdict: z.enum(["pending", "pass", "fail"]),
      note: z.string().nullable(),
    }),
  ),
  rules: z.record(z.string(), z.strictObject({ title: z.string().min(1), lines: z.array(z.string().min(1)).min(1) })),
});

export type Plan = z.infer<typeof planSchema>;
export type Week = Plan["weeks"][number];
export type Phase = Plan["phases"][number];
export type QualityTarget = z.infer<typeof qualityTargetSchema>;
export type LongTarget = z.infer<typeof longTargetSchema>;
export type QualityPace = z.infer<typeof qualityPaceSchema>;
export type LongPace = z.infer<typeof longPaceSchema>;

export class PlanError extends Error {
  override name = "PlanError";
}

/** `["weeks", 4, "quality"]` → `weeks[4].quality`. */
function formatPath(keys: readonly PropertyKey[]): string {
  return keys.map((k, i) => (typeof k === "number" ? `[${k}]` : i === 0 ? String(k) : `.${String(k)}`)).join("");
}

/** Checks that span several keys. Returns one `path: message` per problem; empty when the Plan is sound. */
export function checkPlan(plan: Plan): string[] {
  const problems: string[] = [];
  const { weeks } = plan;
  const weekRange = (n: number) => `${weekStart(plan, n)} to ${weekEnd(plan, n)}`;

  if (!isMonday(plan.block.start)) problems.push("block.start: must be a Monday");
  if (plan.block.lap_m[0] > plan.block.lap_m[1]) problems.push("block.lap_m: min must not exceed max");

  weeks.forEach((w, i) => {
    if (w.n !== i) problems.push(`weeks[${i}].n: must be ${i} (weeks are listed in order from 0)`);
    if (w.runs[0] > w.runs[1]) problems.push(`weeks[${i}].runs: min must not exceed max`);
    if (w.quality !== "test") {
      const sizes = [w.quality.laps_per_rep, w.quality.distance_m, w.quality.duration_s].filter((v) => v !== undefined);
      if (sizes.length !== 1) problems.push(`weeks[${i}].quality: needs exactly one of laps_per_rep, distance_m, duration_s`);
    }
  });

  const goalWeek = (goal: "four_lap" | "osaka", marker: string, has: (w: Week) => boolean) => {
    const found = weeks.filter(has);
    if (found.length !== 1) {
      problems.push(`weeks: needs exactly one week with ${marker} (found ${found.length})`);
      return;
    }
    const n = found[0].n;
    const offset = daysBetween(weekStart(plan, n), plan.goals[goal].date);
    if (offset < 0 || offset > 6) {
      problems.push(`goals.${goal}.date: must fall inside Week ${n} (${weekRange(n)}), the week with ${marker}`);
    }
  };
  goalWeek("four_lap", "quality: test", (w) => w.quality === "test");
  goalWeek("osaka", "long: race", (w) => w.long === "race");

  for (const [id, cp] of Object.entries(plan.checkpoints)) {
    if (cp.week >= weeks.length) problems.push(`checkpoints.${id}.week: no Week ${cp.week} in weeks`);
  }

  plan.phases.forEach((p, i) => {
    if (i === 0 && p.from_week !== 0) problems.push("phases[0].from_week: must be 0");
    if (i > 0 && p.from_week <= plan.phases[i - 1].from_week) {
      problems.push(`phases[${i}].from_week: must be greater than phases[${i - 1}].from_week`);
    }
    if (p.from_week >= weeks.length) problems.push(`phases[${i}].from_week: no Week ${p.from_week} in weeks`);
  });

  return problems;
}

/** Parse and check Plan YAML. `file` only labels error messages. Throws PlanError on any problem. */
export function parsePlan(text: string, file: string): Plan {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new PlanError(`${file}: ${(e as Error).message}`);
  }
  const result = planSchema.safeParse(raw);
  if (!result.success) {
    throw new PlanError(result.error.issues.map((i) => `${file}: ${formatPath(i.path)}: ${i.message}`).join("\n"));
  }
  const problems = checkPlan(result.data);
  if (problems.length > 0) throw new PlanError(problems.map((p) => `${file}: ${p}`).join("\n"));
  return result.data;
}

/** Read and check the committed `training/plan.yaml`. */
export async function loadPlan(): Promise<Plan> {
  return parsePlan(await fs.readFile(PLAN_FILE, "utf8"), PLAN_LABEL);
}

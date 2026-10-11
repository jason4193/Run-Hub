/**
 * A small valid Plan for the plan and plan-view tests: Weeks 0–2 from Mon 5 Oct 2026, the test in
 * Week 1 (Tue 13 Oct) and the race in Week 2 (Sun 25 Oct). Returns a fresh object each call, so a
 * test can break one key and stringify it.
 */
import { stringify } from "yaml";

export function fixturePlan(): any {
  return {
    block: {
      start: "2026-10-05",
      lap_m: [450, 480],
      hr_cap: [{ from: "2026-10-05", bpm: 155, reason: "Until the Week 1 time trial." }],
      threshold: { pace: null, hr_bpm: null, measured_at: null },
    },
    goals: {
      four_lap: {
        date: "2026-10-13",
        reps: 5,
        laps_per_rep: 4,
        rest_s: 600,
        max_spread_s: 5,
        original_pace: "4:00",
        pace: "4:10",
        pace_status: "working",
        pace_rule: "Set at Checkpoint B.",
      },
      osaka: {
        date: "2026-10-25",
        start: "09:15",
        limit_h: 7,
        distance_km: 42.2,
        pace: "7:00",
        best_case_pace: "4:30",
        note: "With a friend.",
      },
    },
    phases: [
      { name: "Transition", from_week: 0, note: "" },
      { name: "Build", from_week: 1, note: "" },
    ],
    weeks: [
      {
        n: 0,
        km: 28,
        runs: [4, 5],
        strength: 2,
        quality: { reps: 4, distance_m: 1000, pace: "4:10", rest_s: 180 },
        long: { distance_km: 12, pace: "easy" },
      },
      {
        n: 1,
        km: 31,
        runs: [3, 4],
        strength: 0,
        flag: "taper",
        quality: "test",
        long: { distance_km: 16, pace: ["7:00", "7:15"] },
        notes: ["Rep one should feel almost too easy."],
      },
      {
        n: 2,
        km: 58,
        runs: [4, 5],
        strength: 0,
        quality: { reps: 1, duration_s: 1200, pace: "threshold" },
        long: "race",
      },
    ],
    checkpoints: { A: { week: 0, pass: "All reps even.", fail: "Repeat the week.", verdict: "pending", note: null } },
    rules: { "weekly-shape": { title: "Weekly shape", lines: ["One quality session and one long run per week."] } },
  };
}

/** The fixture as YAML, after `edit` (when given) breaks or changes one key. */
export function fixtureYaml(edit?: (plan: ReturnType<typeof fixturePlan>) => void): string {
  const plan = fixturePlan();
  edit?.(plan);
  return stringify(plan);
}

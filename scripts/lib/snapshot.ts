/**
 * Daily heartbeat rule (pure, unit-tested). A Sync that found nothing new keeps the committed
 * Snapshot untouched — no commit — unless its `generatedAt` is HEARTBEAT_HOURS or older, so at
 * most one timestamp-only commit lands per day and the coach can still tell "quiet" from "broken".
 */
export const HEARTBEAT_HOURS = 20;

interface Stamped {
  generatedAt: string;
}

export interface SnapshotPair {
  activities: Stamped;
  pace: Stamped;
}

/** JSON text with `generatedAt` blanked, so two files compare on content only. */
function contentKey(file: Stamped): string {
  return JSON.stringify({ ...file, generatedAt: null });
}

/** True when the Snapshot files should be (re)written with a fresh `generatedAt`. */
export function shouldWriteSnapshot(prior: SnapshotPair | null, next: SnapshotPair, nowIso: string): boolean {
  if (!prior) return true;
  const unchanged =
    contentKey(prior.activities) === contentKey(next.activities) && contentKey(prior.pace) === contentKey(next.pace);
  if (!unchanged) return true;
  const ageHours = (Date.parse(nowIso) - Date.parse(prior.activities.generatedAt)) / 3_600_000;
  return !(ageHours < HEARTBEAT_HOURS);
}

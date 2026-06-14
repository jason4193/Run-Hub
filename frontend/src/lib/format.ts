// Display formatters. All pure; no locale-dependent surprises beyond Intl grouping.

/** Pace given in seconds-per-kilometre → "m:ss" (e.g. 312 → "5:12"). */
export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The raw API `pace` field is seconds-per-metre; convert to per-km then format. */
export function formatPaceFromRaw(secPerMeter: number | null): string {
  if (secPerMeter === null || !Number.isFinite(secPerMeter) || secPerMeter <= 0) {
    return "—";
  }
  return formatPace(secPerMeter * 1000);
}

const KM = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Metres → "1,234.5 km". */
export function formatDistanceKm(m: number): string {
  if (!Number.isFinite(m)) return "—";
  return `${KM.format(m / 1000)} km`;
}

/**
 * Seconds → compact duration.
 * Under a day: "H:MM:SS". A day or more: "Dd Hh" (e.g. "3d 4h").
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const total = Math.round(totalSeconds);
  const days = Math.floor(total / 86400);
  if (days >= 1) {
    const hours = Math.floor((total % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

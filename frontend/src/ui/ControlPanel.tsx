import { useState } from "react";
import type { BestEffort } from "../types/snapshot";
import type { LifetimeStats } from "../lib/stats";
import { useCountUp } from "../anim/useCountUp";
import {
  formatDistanceKm,
  formatDuration,
  formatPace,
} from "../lib/format";

// Module-level (stable) formatters — required by useCountUp's dependency contract.
const fmtInt = (v: number): string => Math.round(v).toLocaleString("en-US");
const fmtYear = (v: number): string => Math.round(v).toString();

export interface ControlPanelProps {
  paceEfforts: BestEffort[];
  stats: LifetimeStats;
}

/** A single count-up stat cell. */
function Stat({
  label,
  target,
  format,
}: {
  label: string;
  target: number;
  format: (value: number) => string;
}) {
  const ref = useCountUp(target, format);
  return (
    <div>
      <span className="lifetime-stats__value" ref={ref} />
      <span className="lifetime-stats__label">{label}</span>
    </div>
  );
}

/**
 * Top-left HUD (docs/DESIGN.md §6): a minimal best-efforts text list plus
 * lifetime stats that count up. Persistent on desktop; collapsible on mobile.
 */
export default function ControlPanel({ paceEfforts, stats }: ControlPanelProps) {
  const [collapsed, setCollapsed] = useState(true);

  const sinceYear = stats.runningSince
    ? new Date(stats.runningSince).getFullYear()
    : new Date().getFullYear();

  return (
    <>
      <button
        type="button"
        className="control-panel__toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? "Stats ▸" : "Close ✕"}
      </button>

      <aside className="control-panel" data-collapsed={collapsed}>
        <section className="control-panel__section">
          <h2 className="control-panel__heading">Best efforts</h2>
          <ul className="best-efforts">
            {paceEfforts.length === 0 && <li>No pace data yet.</li>}
            {paceEfforts.map((e) => (
              <li className="best-efforts__row" key={e.distance}>
                <span className="best-efforts__label">{e.label}</span>
                <span className="best-efforts__time">
                  {formatDuration(e.timeSeconds)}
                </span>
                <span className="best-efforts__pace">
                  {formatPace(e.paceSecPerKm)}/km
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="control-panel__section">
          <h2 className="control-panel__heading">Lifetime</h2>
          <div className="lifetime-stats">
            <Stat label="Distance" target={stats.totalDistanceM} format={formatDistanceKm} />
            <Stat label="Runs" target={stats.totalRuns} format={fmtInt} />
            <Stat label="Time" target={stats.totalMovingTimeS} format={formatDuration} />
            <Stat label="Longest" target={stats.longestRunM} format={formatDistanceKm} />
            <Stat label="Running since" target={sinceYear} format={fmtYear} />
          </div>
        </section>
      </aside>
    </>
  );
}

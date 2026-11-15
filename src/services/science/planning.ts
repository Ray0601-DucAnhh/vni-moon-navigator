/** Temporal feasibility: "when is there a long-enough window for an activity?"
 *
 *  An operation window is a time interval in which every condition the user
 *  picked holds at once (Sun disc centre above the terrain horizon by at least
 *  minSunClearanceDeg; Earth centre above it by at least minEarthClearanceDeg).
 *  Edges come from the SAME scan as the app's sunrise/sunset events
 *  (findCrossings: 10-minute scan, bisection to 30 s, rounded to the minute),
 *  so windows agree with the countdowns by construction. Windows cut by the
 *  data range are flagged (startClipped / endClipped). Earth in sight means
 *  geometric line of sight only, never a radio-link claim. */

import type { HorizonMask } from "../../types";
import { parseIsoUtc, toIsoUtc } from "../../lib/time";
import { earthClearance, findCrossings, sunClearance, type EphAccessor } from "./core";

export interface WindowCriteria {
  needSun: boolean;
  needEarth: boolean;
  minSunClearanceDeg?: number;
  minEarthClearanceDeg?: number;
  minDurationH: number;
}

export interface OperationWindow {
  startUtc: string;
  endUtc: string;
  durationH: number;
  /** The window was already open at the start of the data range (true start may be earlier). */
  startClipped: boolean;
  /** The window was still open at the end of the data range (true end may be later). */
  endClipped: boolean;
}

const SCAN_MS = 10 * 60_000;
const REFINE_MS = 30_000;

export function findOperationWindows(
  eph: EphAccessor,
  mask: HorizonMask,
  t0Ms: number,
  t1Ms: number,
  c: WindowCriteria,
): OperationWindow[] {
  if (!c.needSun && !c.needEarth) return [];
  const t0 = Math.max(t0Ms, eph.startMs);
  const t1 = Math.min(t1Ms, eph.endMs);
  if (t1 <= t0) return [];
  const minSun = c.minSunClearanceDeg ?? 0;
  const minEarth = c.minEarthClearanceDeg ?? 0;
  // Combined margin: >= 0 exactly when every required condition holds.
  const g = (t: number) => {
    let m = Infinity;
    if (c.needSun) m = Math.min(m, sunClearance(eph, mask, t) - minSun);
    if (c.needEarth) m = Math.min(m, earthClearance(eph, mask, t) - minEarth);
    return m;
  };

  const out: OperationWindow[] = [];
  let openAt: number | null = g(t0) >= 0 ? t0 : null;
  let clippedStart = openAt !== null;
  const close = (endMs: number, endClipped: boolean) => {
    if (openAt === null) return;
    const durationH = (endMs - openAt) / 3_600_000;
    if (durationH >= c.minDurationH) {
      out.push({ startUtc: toIsoUtc(openAt), endUtc: toIsoUtc(endMs), durationH, startClipped: clippedStart, endClipped });
    }
    openAt = null;
    clippedStart = false;
  };
  for (const ev of findCrossings(g, t0, t1, SCAN_MS, REFINE_MS)) {
    const t = parseIsoUtc(ev.utc);
    if (ev.type === "rise") {
      if (openAt === null) openAt = t;
    } else {
      close(t, false);
    }
  }
  close(t1, true);
  return out;
}

export function totalHours(ws: OperationWindow[]): number {
  return ws.reduce((s, w) => s + w.durationH, 0);
}

/** Rough event-time uncertainty from terrain resolution: recompute the event
 *  with the terrain horizon raised and lowered by deltaDeg (the site's TV-5
 *  RMS sensitivity) and report the spread. A rough estimate, not a
 *  statistical confidence interval. `sensitive` = with the shifted horizon the
 *  event disappears within +/-2 days (e.g. a grazing Sun near the pole). */
export interface EventBounds {
  earliestUtc: string;
  latestUtc: string;
  halfWidthMin: number;
  sensitive: boolean;
}

export function eventTimeBounds(
  eph: EphAccessor,
  mask: HorizonMask,
  event: { type: "rise" | "set"; utc: string },
  kind: "sun" | "earth",
  deltaDeg: number,
): EventBounds | null {
  if (!(deltaDeg > 0)) return null;
  const tEv = parseIsoUtc(event.utc);
  const W = 2 * 86_400_000;
  const t0 = Math.max(eph.startMs, tEv - W);
  const t1 = Math.min(eph.endMs, tEv + W);
  const base = (t: number) => (kind === "sun" ? sunClearance(eph, mask, t) : earthClearance(eph, mask, t));
  const times: number[] = [tEv];
  let sensitive = false;
  for (const off of [deltaDeg, -deltaDeg]) {
    const evs = findCrossings((t) => base(t) - off, t0, t1, SCAN_MS, REFINE_MS).filter((e) => e.type === event.type);
    if (evs.length === 0) {
      sensitive = true;
      continue;
    }
    let best = parseIsoUtc(evs[0].utc);
    for (const e of evs) {
      const t = parseIsoUtc(e.utc);
      if (Math.abs(t - tEv) < Math.abs(best - tEv)) best = t;
    }
    times.push(best);
  }
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  return { earliestUtc: toIsoUtc(lo), latestUtc: toIsoUtc(hi), halfWidthMin: (hi - lo) / 120_000, sensitive };
}

/* ---------- Level C: transparent multi-criteria trade-offs (no imposed ranking) ---------- */

export interface SiteMetrics {
  id: string;
  sunlitFrac: number;
  earthFrac: number;
  longestWindowH: number;
  longestDarkH: number;
  horizonRmsDeg: number;
}
type MetricKey = Exclude<keyof SiteMetrics, "id">;

export const METRIC_KEYS: { k: MetricKey; higherBetter: boolean }[] = [
  { k: "sunlitFrac", higherBetter: true },
  { k: "earthFrac", higherBetter: true },
  { k: "longestWindowH", higherBetter: true },
  { k: "longestDarkH", higherBetter: false },
  { k: "horizonRmsDeg", higherBetter: false },
];

/** Sites not dominated by any other site (>= on every criterion, > on one). */
export function paretoFront(ms: SiteMetrics[]): string[] {
  const better = (a: SiteMetrics, b: SiteMetrics) => {
    let strictly = false;
    for (const { k, higherBetter } of METRIC_KEYS) {
      const d = higherBetter ? a[k] - b[k] : b[k] - a[k];
      if (d < 0) return false;
      if (d > 0) strictly = true;
    }
    return strictly;
  };
  return ms.filter((m) => !ms.some((o) => o.id !== m.id && better(o, m))).map((m) => m.id);
}

/** Min-max normalised (0..1, 1 = better) weighted mean. */
export function weightedScores(ms: SiteMetrics[], w: Record<string, number>): Record<string, number> {
  const norm: Record<string, Record<string, number>> = {};
  for (const { k, higherBetter } of METRIC_KEYS) {
    const vals = ms.map((m) => m[k]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    for (const m of ms) {
      const x = hi > lo ? (m[k] - lo) / (hi - lo) : 1;
      (norm[m.id] ??= {})[k] = higherBetter ? x : 1 - x;
    }
  }
  const wSum = METRIC_KEYS.reduce((s, { k }) => s + Math.max(0, w[k] ?? 0), 0) || 1;
  const out: Record<string, number> = {};
  for (const m of ms) out[m.id] = METRIC_KEYS.reduce((s, { k }) => s + Math.max(0, w[k] ?? 0) * norm[m.id][k], 0) / wSum;
  return out;
}

/** Share of random weightings (Dirichlet(1,...,1), seeded, n samples) under
 *  which each site scores highest - how much the answer depends on weights. */
export function rankStability(ms: SiteMetrics[], n = 2000, seed = 42): Record<string, number> {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const wins: Record<string, number> = Object.fromEntries(ms.map((m) => [m.id, 0]));
  for (let i = 0; i < n; i++) {
    const w: Record<string, number> = {};
    for (const { k } of METRIC_KEYS) w[k] = -Math.log(1 - rnd());
    const sc = weightedScores(ms, w);
    let best = ms[0].id;
    for (const m of ms) if (sc[m.id] > sc[best]) best = m.id;
    wins[best]++;
  }
  for (const k of Object.keys(wins)) wins[k] /= n;
  return wins;
}

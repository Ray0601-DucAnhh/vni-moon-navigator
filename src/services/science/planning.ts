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

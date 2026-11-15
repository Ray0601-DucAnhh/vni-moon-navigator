/** Deterministic science core. Pure functions over precomputed data.
 *  Used identically by the app UI, the AI assistant's tools, the offline
 *  pipeline (via tsx) and the test suite, so every surface agrees (TV-10).
 *
 *  Method summary (see docs/methods.md):
 *  - Sun/Earth apparent az/el: linear interpolation between JPL Horizons
 *    samples (azimuth on the shorter arc).
 *  - Terrain horizon: per-azimuth mask built offline from LOLA DEMs.
 *  - "Sunlit" (terrain-aware): fraction of the solar disc above the terrain
 *    horizon >= 0.5, i.e. disc centre above the horizon. The horizon is
 *    treated as straight across the 0.27-degree disc.
 *  - Earth "visible": Earth CENTRE above the terrain horizon. Geometric line
 *    of sight only - not a communication link.
 *  - Smooth-Moon reference: the same tests against a 0-degree horizon
 *    (local horizontal plane, no terrain), matching Horizons' elevation
 *    reference. Shown so the terrain effect is visible either way. */

import type {
  HorizonMask,
  SiteDerived,
  SiteEphemeris,
  SiteEvent,
  SiteState,
  WindowStats,
} from "../../types";
import { parseIsoUtc, toIsoUtc } from "../../lib/time";

/** Solar angular radius assumed constant at 1 au:
 *  asin(695,700 km / 149,597,870.7 km) = 0.26645 deg (IAU 2015 nominal solar
 *  radius, printed in the Horizons header). Earth-Moon distance variation of
 *  the Sun-Moon range (+/-1.7%) changes this by < 0.005 deg. */
export const SUN_ANGULAR_RADIUS_DEG =
  (Math.asin(695_700 / 149_597_870.7) * 180) / Math.PI;

export interface EphAccessor {
  startMs: number;
  endMs: number;
  stepMs: number;
  sun(tMs: number): { azDeg: number; elDeg: number };
  earth(tMs: number): { azDeg: number; elDeg: number };
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

/** Interpolate azimuth along the shorter arc, result in [0,360). */
export function lerpAzDeg(a: number, b: number, f: number): number {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  let r = (a + d * f) % 360;
  if (r < 0) r += 360;
  return r;
}

export function makeEphAccessor(eph: SiteEphemeris): EphAccessor {
  const startMs = parseIsoUtc(eph.startUtc);
  const stepMs = eph.stepS * 1000;
  const endMs = startMs + (eph.count - 1) * stepMs;
  const at = (az: number[], el: number[], tMs: number) => {
    const x = (tMs - startMs) / stepMs;
    const i = Math.min(eph.count - 2, Math.max(0, Math.floor(x)));
    const f = Math.min(1, Math.max(0, x - i));
    return {
      azDeg: lerpAzDeg(az[i], az[i + 1], f),
      elDeg: lerp(el[i], el[i + 1], f),
    };
  };
  return {
    startMs,
    endMs,
    stepMs,
    sun: (t) => at(eph.sunAz, eph.sunEl, t),
    earth: (t) => at(eph.earthAz, eph.earthEl, t),
  };
}

/** Terrain horizon elevation at an azimuth (linear interpolation, wraps). */
export function horizonElAt(mask: HorizonMask, azDeg: number): number {
  const n = mask.horizonElDeg.length;
  let a = (azDeg / mask.azStepDeg) % n;
  if (a < 0) a += n;
  const i = Math.floor(a) % n;
  const f = a - Math.floor(a);
  return lerp(mask.horizonElDeg[i], mask.horizonElDeg[(i + 1) % n], f);
}

export function horizonDistAt(mask: HorizonMask, azDeg: number): number {
  const n = mask.horizonDistKm.length;
  let a = (azDeg / mask.azStepDeg) % n;
  if (a < 0) a += n;
  return mask.horizonDistKm[Math.round(a) % n];
}

/** Earth's mean angular radius seen from the Moon: asin(6,371 km / 384,400 km)
 *  = 0.95 deg (the Earth-Moon distance varies by about +/-5.5%, so +/-0.05 deg). */
export const EARTH_ANGULAR_RADIUS_DEG = (Math.asin(6371 / 384_400) * 180) / Math.PI;

/** Fraction of the Earth's disc above the terrain horizon (same straight-horizon
 *  formula as the Sun). Display only: "Earth visible" stays defined by the
 *  Earth's centre, so all shipped statistics are unchanged. */
export function earthVisibleFraction(clearanceDeg: number): number {
  const x = Math.min(1, Math.max(-1, clearanceDeg / EARTH_ANGULAR_RADIUS_DEG));
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
}

/** Fraction of the solar disc above a horizon at elevation hDeg, for a disc
 *  centre at elDeg. Straight-horizon approximation across the disc. */
export function sunVisibleFraction(elDeg: number, hDeg: number): number {
  const x = Math.min(1, Math.max(-1, (elDeg - hDeg) / SUN_ANGULAR_RADIUS_DEG));
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
}

export function getSiteState(
  eph: EphAccessor,
  mask: HorizonMask,
  tMs: number,
): SiteState {
  const inRange = tMs >= eph.startMs && tMs <= eph.endMs;
  const s = eph.sun(tMs);
  const e = eph.earth(tMs);
  const hs = horizonElAt(mask, s.azDeg);
  const he = horizonElAt(mask, e.azDeg);
  const frac = sunVisibleFraction(s.elDeg, hs);
  return {
    utc: toIsoUtc(tMs, true),
    inRange,
    sun: {
      azDeg: s.azDeg,
      elDeg: s.elDeg,
      horizonElDeg: hs,
      clearanceDeg: s.elDeg - hs,
      visibleFraction: frac,
      sunlit: s.elDeg - hs >= 0,
      smoothSunlit: s.elDeg >= 0,
    },
    earth: {
      azDeg: e.azDeg,
      elDeg: e.elDeg,
      horizonElDeg: he,
      clearanceDeg: e.elDeg - he,
      visible: e.elDeg - he >= 0,
      smoothVisible: e.elDeg >= 0,
    },
  };
}

/** Clearance functions whose zero-crossings are the terrain events. */
export function sunClearance(eph: EphAccessor, mask: HorizonMask, tMs: number): number {
  const s = eph.sun(tMs);
  return s.elDeg - horizonElAt(mask, s.azDeg);
}

export function earthClearance(eph: EphAccessor, mask: HorizonMask, tMs: number): number {
  const e = eph.earth(tMs);
  return e.elDeg - horizonElAt(mask, e.azDeg);
}

/** Find zero crossings of f over [t0,t1], scanning at coarseMs and bisecting
 *  each sign change down to refineMs. Events shorter than coarseMs can be
 *  missed (documented limitation). */
export function findCrossings(
  f: (tMs: number) => number,
  t0: number,
  t1: number,
  coarseMs: number,
  refineMs: number,
): SiteEvent[] {
  const out: SiteEvent[] = [];
  let tPrev = t0;
  let vPrev = f(t0);
  for (let t = t0 + coarseMs; t <= t1; t += coarseMs) {
    const v = f(t);
    if ((vPrev < 0 && v >= 0) || (vPrev >= 0 && v < 0)) {
      let lo = tPrev;
      let hi = t;
      let vLo = vPrev;
      while (hi - lo > refineMs) {
        const mid = (lo + hi) / 2;
        const vm = f(mid);
        if ((vLo < 0 && vm >= 0) || (vLo >= 0 && vm < 0)) hi = mid;
        else {
          lo = mid;
          vLo = vm;
        }
      }
      out.push({ type: vPrev < 0 ? "rise" : "set", utc: toIsoUtc(Math.round(hi / 60000) * 60000, true) });
    }
    tPrev = t;
    vPrev = v;
  }
  return out;
}

/** Next event strictly after tMs, or null. Events must be time-ordered. */
export function nextEvent(events: SiteEvent[], tMs: number): SiteEvent | null {
  for (const ev of events) {
    if (parseIsoUtc(ev.utc) > tMs) return ev;
  }
  return null;
}

/** Window statistics by 10-minute sampling from tMs over `days` days,
 *  clamped to ephemeris coverage. */
export function windowStats(
  eph: EphAccessor,
  mask: HorizonMask,
  tMs: number,
  days: number,
): WindowStats {
  const stepMs = 10 * 60_000;
  const t0 = Math.max(tMs, eph.startMs);
  const t1 = Math.min(tMs + days * 86_400_000, eph.endMs);
  let n = 0;
  let sun = 0;
  let earth = 0;
  let both = 0;
  let sSun = 0;
  let sEarth = 0;
  let darkRun = 0;
  let maxDark = 0;
  for (let t = t0; t <= t1; t += stepMs) {
    const sc = sunClearance(eph, mask, t);
    const ec = earthClearance(eph, mask, t);
    const sunUp = sc >= 0;
    const earthUp = ec >= 0;
    n++;
    if (sunUp) sun++;
    if (earthUp) earth++;
    if (sunUp && earthUp) both++;
    if (eph.sun(t).elDeg >= 0) sSun++;
    if (eph.earth(t).elDeg >= 0) sEarth++;
    if (!sunUp) {
      darkRun++;
      if (darkRun > maxDark) maxDark = darkRun;
    } else darkRun = 0;
  }
  const safeN = Math.max(1, n);
  return {
    startUtc: toIsoUtc(t0),
    days: (t1 - t0) / 86_400_000,
    sunlitFrac: sun / safeN,
    earthFrac: earth / safeN,
    bothFrac: both / safeN,
    smoothSunlitFrac: sSun / safeN,
    smoothEarthFrac: sEarth / safeN,
    longestDarkH: (maxDark * stepMs) / 3_600_000,
  };
}

/** Consistency helper used by TV-10 and the countdown UI. */
export function stateFromEvents(events: SiteEvent[], tMs: number): boolean | null {
  let last: SiteEvent | null = null;
  for (const ev of events) {
    if (parseIsoUtc(ev.utc) <= tMs) last = ev;
    else break;
  }
  if (!last) return null;
  return last.type === "rise";
}

export function derivedNextEvents(
  derived: SiteDerived,
  tMs: number,
): { sun: SiteEvent | null; earth: SiteEvent | null } {
  return {
    sun: nextEvent(derived.sunEvents, tMs),
    earth: nextEvent(derived.earthEvents, tMs),
  };
}

/** Compute kernel for the south-polar terrain grid (Level B-grid).
 *  Used by the worker threads (build-polar-grid) and by the validator, so the
 *  validated code is the shipped code.
 *
 *  Horizon: same geometry as build-horizon-masks.ts (observer 2 m above the
 *  DEM, great-circle rays, elevation vs the observer's local horizontal
 *  plane, lunar curvature inherent, airless), but with 1-degree azimuth bins
 *  and a coarser distance ladder (80 m steps to 8 km, then 1% of the
 *  distance, to 300 km) over the 80 m / 240 m LOLA grids only.
 *  Because P = (R+h)u and O = (R+h0)uO with u.uO = cos s, the elevation sine
 *  depends only on h and the angular distance s:
 *    sin el = ((R+h) cos s - rO) / sqrt((R+h)^2 + rO^2 - 2 (R+h) rO cos s). */

import { R_MOON_M } from "../../src/lib/coords";
import { POLAR_AZ_BINS, POLAR_OBSERVER_HEIGHT_M, encodeEl, maskElAt } from "../../src/services/science/polarGrid";

export interface RawGrid {
  data: Float32Array;
  width: number;
  height: number;
  px: number;
  X0: number;
  Y0: number;
  /** |x|,|y| limit (m) inside which this grid is used. */
  box: number;
}

const D2R = Math.PI / 180;

function bilinear(g: RawGrid, x: number, y: number): number {
  const colF = (x - g.X0) / g.px - 0.5;
  const rowF = (g.Y0 - y) / g.px - 0.5;
  const c0 = Math.floor(colF);
  const r0 = Math.floor(rowF);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= g.width || r0 + 1 >= g.height) return NaN;
  const fx = colF - c0;
  const fy = rowF - r0;
  const o = r0 * g.width + c0;
  const d = g.data;
  return (
    d[o] * (1 - fx) * (1 - fy) + d[o + 1] * fx * (1 - fy) + d[o + g.width] * (1 - fx) * fy + d[o + g.width + 1] * fx * fy
  );
}

/** Height (m) at stereographic (x, y): 80 m grid inside its box, else 240 m. */
export function heightAtXY(g80: RawGrid, g240: RawGrid, x: number, y: number): number {
  if (Math.abs(x) <= g80.box && Math.abs(y) <= g80.box) {
    const h = bilinear(g80, x, y);
    if (h === h) return h;
  }
  if (Math.abs(x) <= g240.box && Math.abs(y) <= g240.box) return bilinear(g240, x, y);
  return NaN;
}

/** Distance ladder (m) and the cos/sin of the matching angular distances. */
export function distanceLadder(): { d: Float64Array; cos: Float64Array; sin: Float64Array } {
  const ds: number[] = [];
  for (let d = 80; d <= 8000; d += 80) ds.push(d);
  for (let d = 8000 * 1.01; d <= 300_000; d *= 1.01) ds.push(d);
  const d = Float64Array.from(ds);
  return { d, cos: d.map((v) => Math.cos(v / R_MOON_M)), sin: d.map((v) => Math.sin(v / R_MOON_M)) };
}

export interface NodeMask {
  /** Encoded mask (360 bytes, see polarGrid.encodeEl). */
  bytes: Uint8Array;
  /** Unquantised horizon elevation per bin (deg), for validation. */
  elDeg: Float64Array;
  demHeightM: number;
  misses: number;
}

/** Terrain horizon at (latDeg, lonDeg); demHeight NaN if no DEM there. */
export function computeNodeMask(
  g80: RawGrid,
  g240: RawGrid,
  latDeg: number,
  lonDeg: number,
  ladder = distanceLadder(),
): NodeMask {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  const uO = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const w0 = (2 * R_MOON_M) / (1 - uO[2]);
  const h0 = heightAtXY(g80, g240, w0 * uO[1], w0 * uO[0]);
  const bytes = new Uint8Array(POLAR_AZ_BINS);
  const elDeg = new Float64Array(POLAR_AZ_BINS);
  if (!(h0 === h0)) return { bytes, elDeg: elDeg.fill(NaN), demHeightM: NaN, misses: 0 };
  const rO = R_MOON_M + h0 + POLAR_OBSERVER_HEIGHT_M;
  const { cos, sin } = ladder;
  const m = cos.length;
  let misses = 0;
  for (let k = 0; k < POLAR_AZ_BINS; k++) {
    const A = k * D2R;
    const sA = Math.sin(A);
    const cA = Math.cos(A);
    const tx = e[0] * sA + n[0] * cA;
    const ty = e[1] * sA + n[1] * cA;
    const tz = e[2] * sA + n[2] * cA;
    let best = -1;
    for (let q = 0; q < m; q++) {
      const c = cos[q];
      const s = sin[q];
      const ux = uO[0] * c + tx * s;
      const uy = uO[1] * c + ty * s;
      const uz = uO[2] * c + tz * s;
      const w = (2 * R_MOON_M) / (1 - uz);
      const h = heightAtXY(g80, g240, w * uy, w * ux);
      if (!(h === h)) {
        misses++;
        continue;
      }
      const rP = R_MOON_M + h;
      const num = rP * c - rO;
      const sinEl = num / Math.sqrt(rP * rP + rO * rO - 2 * rP * rO * c);
      if (sinEl > best) best = sinEl;
    }
    const el = Math.asin(Math.max(-1, Math.min(1, best))) / D2R;
    elDeg[k] = el;
    bytes[k] = encodeEl(el);
  }
  return { bytes, elDeg, demHeightM: h0, misses };
}

/** Moon-centred unit vectors of the sub-solar and sub-Earth points at each
 *  geocentric sample (hourly, moon-geocentric.json). */
export interface SkyTables {
  count: number;
  sun: Float64Array; // 3*count
  earth: Float64Array; // 3*count
}

export function skyTables(geo: {
  count: number;
  subSolarLonE: number[];
  subSolarLat: number[];
  subEarthLonE: number[];
  subEarthLat: number[];
}): SkyTables {
  const sun = new Float64Array(3 * geo.count);
  const earth = new Float64Array(3 * geo.count);
  for (let t = 0; t < geo.count; t++) {
    const put = (arr: Float64Array, lat: number, lon: number) => {
      const a = lat * D2R;
      const o = lon * D2R;
      arr[3 * t] = Math.cos(a) * Math.cos(o);
      arr[3 * t + 1] = Math.cos(a) * Math.sin(o);
      arr[3 * t + 2] = Math.sin(a);
    };
    put(sun, geo.subSolarLat[t], geo.subSolarLonE[t]);
    put(earth, geo.subEarthLat[t], geo.subEarthLonE[t]);
  }
  return { count: geo.count, sun, earth };
}

/* Same constants as src/services/science/customPoint.ts (skyAt). */
const R_MOON_KM = 1737.4;
const EARTH_MOON_KM = 384_400;
const SUN_KM = 149_597_870.7;

/** Kernel Sun/Earth az/el at one sample (same maths as yearCounts), for the
 *  equivalence check against skyAt (validation PG-3). */
export function kernelSky(latDeg: number, lonDeg: number, sky: SkyTables, t: number) {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const f = (b: Float64Array, dist: number) => {
    const vx = b[3 * t] * dist - up[0] * R_MOON_KM;
    const vy = b[3 * t + 1] * dist - up[1] * R_MOON_KM;
    const vz = b[3 * t + 2] * dist - up[2] * R_MOON_KM;
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const elDeg = Math.asin((vx * up[0] + vy * up[1] + vz * up[2]) / len) / D2R;
    let azDeg = Math.atan2(vx * e[0] + vy * e[1] + vz * e[2], vx * n[0] + vy * n[1] + vz * n[2]) / D2R;
    if (azDeg < 0) azDeg += 360;
    return { azDeg, elDeg };
  };
  return { sun: f(sky.sun, SUN_KM), earth: f(sky.earth, EARTH_MOON_KM) };
}

export interface YearCounts {
  samples: number;
  sun: number;
  earth: number;
  both: number;
  longestDarkH: number;
  maxSunElDeg: number;
  maxEarthElDeg: number;
}

/** Year statistics for one point, hourly. Sun "visible" = disc centre above
 *  the terrain horizon (the app's sunlit rule); Earth = centre above it.
 *  Topocentric directions exactly as skyAt (validated, SV-6), height 0. */
export function yearCounts(latDeg: number, lonDeg: number, mask: ArrayLike<number> | null, sky: SkyTables, stepH = 1): YearCounts {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  let sunN = 0;
  let earthN = 0;
  let bothN = 0;
  let dark = 0;
  let longest = 0;
  let maxS = -90;
  let maxE = -90;
  const el = (b: Float64Array, t: number, dist: number) => {
    const vx = b[3 * t] * dist - up[0] * R_MOON_KM;
    const vy = b[3 * t + 1] * dist - up[1] * R_MOON_KM;
    const vz = b[3 * t + 2] * dist - up[2] * R_MOON_KM;
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const elDeg = Math.asin(Math.max(-1, Math.min(1, (vx * up[0] + vy * up[1] + vz * up[2]) / len))) / D2R;
    const az = Math.atan2(vx * e[0] + vy * e[1] + vz * e[2], vx * n[0] + vy * n[1] + vz * n[2]) / D2R;
    return { elDeg, az: az < 0 ? az + 360 : az };
  };
  for (let t = 0; t < sky.count; t++) {
    const s = el(sky.sun, t, SUN_KM);
    const g = el(sky.earth, t, EARTH_MOON_KM);
    if (s.elDeg > maxS) maxS = s.elDeg;
    if (g.elDeg > maxE) maxE = g.elDeg;
    const hs = mask ? maskElAt(mask, s.az) : 0;
    const hg = mask ? maskElAt(mask, g.az) : 0;
    const sv = s.elDeg > hs;
    const gv = g.elDeg > hg;
    if (sv) sunN++;
    if (gv) earthN++;
    if (sv && gv) bothN++;
    if (sv) dark = 0;
    else {
      dark += stepH;
      if (dark > longest) longest = dark;
    }
  }
  return { samples: sky.count, sun: sunN, earth: earthN, both: bothN, longestDarkH: longest, maxSunElDeg: maxS, maxEarthElDeg: maxE };
}

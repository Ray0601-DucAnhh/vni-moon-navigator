/** South-polar terrain grid ("Level B-grid"): geometry, node lookup and the
 *  horizon-mask encoding shared by the offline pipeline
 *  (scripts/terrain/build-polar-grid.ts), the app and the tests.
 *
 *  Grid: south polar stereographic metres (the PGDA LOLA projection,
 *  src/lib/coords.ts southStereo), node (i, j) at
 *    x = -HALF + i*SPACING,  y = HALF - j*SPACING,   i, j = 0..N-1.
 *  Masks: 360 azimuth bins (bin k = azimuth k deg, clockwise from north),
 *  one byte each: elDeg = byte / 10 - 5  (-5.0 .. +20.5 deg, 0.1 deg step).
 *  Values at or above 20.5 deg are clamped; validation PG-5 confirms no Sun
 *  or Earth position in the data year is ever that high inside the grid, so
 *  the clamp never changes a visibility result. */

import { southStereo, southStereoInverse } from "../../lib/coords";
import type { HorizonMask } from "../../types";

export const POLAR_SPACING_M = 2000;
export const POLAR_HALF_M = 300_000;
export const POLAR_N = Math.round((2 * POLAR_HALF_M) / POLAR_SPACING_M) + 1; // 301
export const POLAR_NODES = POLAR_N * POLAR_N;
export const POLAR_AZ_BINS = 360;
export const POLAR_CHUNK = 31; // nodes per chunk side
export const POLAR_CHUNKS = Math.ceil(POLAR_N / POLAR_CHUNK); // 10
export const POLAR_EL_MIN = -5;
export const POLAR_EL_MAX = 20.5;
export const POLAR_OBSERVER_HEIGHT_M = 2;
/** The map and lookups use the disc rho <= POLAR_HALF_M (about 80.1 S to the
 *  pole); the square's corners are computed but not offered. */
export const POLAR_RADIUS_M = POLAR_HALF_M;
/** Colour-scale top per map layer (values above draw at the top colour).
 *  Sunlit never exceeds ~76% anywhere in the grid (PG-4), so its scale stops
 *  at 80% for contrast; Earth visibility reaches 100%. */
export const POLAR_SCALE_MAX = { sun: 0.8, earth: 1, both: 0.8 } as const;

export function encodeEl(elDeg: number): number {
  return Math.max(0, Math.min(255, Math.round((elDeg - POLAR_EL_MIN) * 10)));
}
export function decodeEl(v: number): number {
  return v / 10 + POLAR_EL_MIN;
}

export function nodeXY(i: number, j: number): { x: number; y: number } {
  return { x: -POLAR_HALF_M + i * POLAR_SPACING_M, y: POLAR_HALF_M - j * POLAR_SPACING_M };
}

export function nodeLatLon(i: number, j: number): { latDeg: number; lonDeg: number } {
  const { x, y } = nodeXY(i, j);
  if (x === 0 && y === 0) return { latDeg: -90, lonDeg: 0 };
  return southStereoInverse(x, y);
}

export function nodeIndex(i: number, j: number): number {
  return j * POLAR_N + i;
}

/** Nearest grid node to a coordinate, or null outside the grid. */
export function nearestNode(latDeg: number, lonDeg: number): { i: number; j: number; idx: number; distM: number } | null {
  if (latDeg > -60) return null;
  const { x, y } = southStereo(latDeg, lonDeg);
  if (Math.hypot(x, y) > POLAR_RADIUS_M) return null;
  const i = Math.round((x + POLAR_HALF_M) / POLAR_SPACING_M);
  const j = Math.round((POLAR_HALF_M - y) / POLAR_SPACING_M);
  if (i < 0 || j < 0 || i >= POLAR_N || j >= POLAR_N) return null;
  const n = nodeXY(i, j);
  // Stereographic scale k = 2/(1 - sin lat)... at the pole k=1; within the
  // grid (|lat| >= ~76 deg) the scale error is < 1.5%, ample for a distance
  // shown to 0.1 km.
  const k = 2 / (1 + Math.sin((-latDeg * Math.PI) / 180));
  return { i, j, idx: nodeIndex(i, j), distM: Math.hypot(x - n.x, y - n.y) / k };
}

export function chunkOf(i: number, j: number): { ci: number; cj: number; li: number; lj: number } {
  const ci = Math.floor(i / POLAR_CHUNK);
  const cj = Math.floor(j / POLAR_CHUNK);
  return { ci, cj, li: i - ci * POLAR_CHUNK, lj: j - cj * POLAR_CHUNK };
}

export function chunkSize(c: number): number {
  return Math.min(POLAR_CHUNK, POLAR_N - c * POLAR_CHUNK);
}

export function chunkFile(ci: number, cj: number): string {
  return `masks/c_${ci}_${cj}.bin.gz`;
}

/** Byte offset of node (li, lj) inside its chunk file (row-major by lj). */
export function offsetInChunk(ci: number, li: number, lj: number): number {
  return (lj * chunkSize(ci) + li) * POLAR_AZ_BINS;
}

/** Horizon elevation (deg) from a 360-bin byte mask at any azimuth
 *  (linear between 1-degree bins, wraps at 360). */
export function maskElAt(bytes: ArrayLike<number>, azDeg: number): number {
  let a = azDeg % 360;
  if (a < 0) a += 360;
  const k = Math.floor(a);
  const f = a - k;
  const v0 = bytes[k % 360];
  const v1 = bytes[(k + 1) % 360];
  return decodeEl(v0 + (v1 - v0) * f);
}

/** Expand a node mask to the app's 0.1-degree HorizonMask format so every
 *  existing function (state, events, windows, panorama) works unchanged. */
export function toHorizonMask(bytes: ArrayLike<number>, node: { i: number; j: number }, demHeightM: number): HorizonMask {
  const horizonElDeg = new Array<number>(3600);
  for (let k = 0; k < 3600; k++) horizonElDeg[k] = maskElAt(bytes, k / 10);
  return {
    siteId: `polar_${node.i}_${node.j}`,
    azStepDeg: 0.1,
    horizonElDeg,
    horizonDistKm: new Array<number>(3600).fill(0),
    observerHeightM: POLAR_OBSERVER_HEIGHT_M,
    demHeightM,
    smoothRefDeg: 0,
    demFiles: ["LDEM_80S_80MPP_ADJ.TIF (80 m)", "LDEM_60S_240MPP_ADJ.TIF (240 m)"],
    effectiveResM: null,
    maxRangeKm: 300,
    nanSamples: 0,
    generated: "polar grid (Level B-grid)",
    terrainFamily: "polar80",
    resolutionNote: "Level B-grid: LOLA 80 m DEM (240 m beyond 80°S box), 2 km node spacing, 1° azimuth bins",
  };
}

/** Per-node year statistics as stored in stats.bin (see meta.json). */
export interface PolarNodeStats {
  sunlitFrac: number;
  earthFrac: number;
  bothFrac: number;
  longestDarkH: number;
  demHeightM: number;
}

export interface PolarStats {
  n: number;
  sun: Uint8Array; // half-percent 0..200
  earth: Uint8Array;
  both: Uint8Array;
  dark: Uint16Array; // hours
  height: Int16Array; // metres
}

/** stats.bin layout: sun u8[N] | earth u8[N] | both u8[N] | pad u8 (N odd) |
 *  dark u16le[N] | height i16le[N]. */
export function statsLayout(n: number) {
  const sun = 0;
  const earth = n;
  const both = 2 * n;
  const dark = 3 * n + ((3 * n) % 2);
  const height = dark + 2 * n;
  return { sun, earth, both, dark, height, bytes: height + 2 * n };
}

export function parseStats(buf: ArrayBuffer, n = POLAR_NODES): PolarStats {
  const L = statsLayout(n);
  if (buf.byteLength !== L.bytes) throw new Error(`polar stats: expected ${L.bytes} bytes, got ${buf.byteLength}`);
  const dv = new DataView(buf);
  const dark = new Uint16Array(n);
  const height = new Int16Array(n);
  for (let k = 0; k < n; k++) {
    dark[k] = dv.getUint16(L.dark + 2 * k, true);
    height[k] = dv.getInt16(L.height + 2 * k, true);
  }
  return {
    n,
    sun: new Uint8Array(buf, L.sun, n),
    earth: new Uint8Array(buf, L.earth, n),
    both: new Uint8Array(buf, L.both, n),
    dark,
    height,
  };
}

export function nodeStats(s: PolarStats, idx: number): PolarNodeStats {
  return {
    sunlitFrac: s.sun[idx] / 200,
    earthFrac: s.earth[idx] / 200,
    bothFrac: s.both[idx] / 200,
    longestDarkH: s.dark[idx],
    demHeightM: s.height[idx],
  };
}

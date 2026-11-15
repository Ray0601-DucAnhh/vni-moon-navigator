/** Worker thread for build-polar-grid.ts: computes masks + year statistics
 *  for whole grid rows. Grids and sky tables arrive as SharedArrayBuffers. */

import { parentPort, workerData } from "node:worker_threads";
import { computeNodeMask, distanceLadder, yearCounts, type RawGrid, type SkyTables } from "../lib/polarKernel";
import { POLAR_AZ_BINS, POLAR_N, nodeLatLon } from "../../src/services/science/polarGrid";

interface Init {
  g80: Omit<RawGrid, "data"> & { buf: SharedArrayBuffer };
  g240: Omit<RawGrid, "data"> & { buf: SharedArrayBuffer };
  sky: { count: number; sun: SharedArrayBuffer; earth: SharedArrayBuffer };
}

const init = workerData as Init;
const g80: RawGrid = { ...init.g80, data: new Float32Array(init.g80.buf) };
const g240: RawGrid = { ...init.g240, data: new Float32Array(init.g240.buf) };
const sky: SkyTables = { count: init.sky.count, sun: new Float64Array(init.sky.sun), earth: new Float64Array(init.sky.earth) };
const ladder = distanceLadder();

parentPort!.on("message", (j: number) => {
  const masks = new Uint8Array(POLAR_N * POLAR_AZ_BINS);
  const sun = new Uint16Array(POLAR_N);
  const earth = new Uint16Array(POLAR_N);
  const both = new Uint16Array(POLAR_N);
  const dark = new Uint16Array(POLAR_N);
  const height = new Float32Array(POLAR_N);
  let misses = 0;
  let maxSun = -90;
  let maxEarth = -90;
  let maxHorizon = -90;
  let noDem = 0;
  for (let i = 0; i < POLAR_N; i++) {
    const { latDeg, lonDeg } = nodeLatLon(i, j);
    const m = computeNodeMask(g80, g240, latDeg, lonDeg, ladder);
    if (!(m.demHeightM === m.demHeightM)) {
      noDem++;
      height[i] = NaN;
      continue;
    }
    masks.set(m.bytes, i * POLAR_AZ_BINS);
    misses += m.misses;
    for (const v of m.elDeg) if (v > maxHorizon) maxHorizon = v;
    const c = yearCounts(latDeg, lonDeg, m.bytes, sky);
    sun[i] = c.sun;
    earth[i] = c.earth;
    both[i] = c.both;
    dark[i] = c.longestDarkH;
    height[i] = m.demHeightM;
    if (c.maxSunElDeg > maxSun) maxSun = c.maxSunElDeg;
    if (c.maxEarthElDeg > maxEarth) maxEarth = c.maxEarthElDeg;
  }
  parentPort!.postMessage(
    { j, masks, sun, earth, both, dark, height, misses, maxSun, maxEarth, maxHorizon, noDem },
    [masks.buffer, sun.buffer, earth.buffer, both.buffer, dark.buffer, height.buffer],
  );
});

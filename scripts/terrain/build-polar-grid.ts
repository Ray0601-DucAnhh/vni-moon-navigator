/** Build the south-polar terrain grid (Level B-grid): a terrain horizon mask
 *  and year Sun/Earth statistics for every node of a 2 km grid over the
 *  LOLA 80S stereographic box. See docs/plan-south-pole-map.md.
 *
 *  Inputs (all local): LDEM_80S_80MPP_ADJ.TIF, LDEM_60S_240MPP_ADJ.TIF (S34,
 *  data-raw/dem-cache) and public/data/ephemeris/moon-geocentric.json (S50).
 *  Outputs: public/data/polar/{meta.json, stats.bin.gz, masks/c_<ci>_<cj>.bin.gz}.
 *
 *  Usage: npm run data:polar [-- --threads=11] [-- --rows=150-152 (test run,
 *  written to data-raw/validation/polar-test/ instead)] */

import path from "node:path";
import os from "node:os";
import { Worker } from "node:worker_threads";
import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { BOX_60S, BOX_80S, DATA_PUBLIC, DATA_RAW, DEM_CACHE, DEM_FILES, log, readJson, round, sha256, updateManifest } from "../lib/common";
import { CogReader, fileSource } from "../lib/bigtiff";
import { loadRawGridShared } from "../lib/demgrid";
import { skyTables } from "../lib/polarKernel";
import {
  POLAR_AZ_BINS, POLAR_CHUNK, POLAR_CHUNKS, POLAR_EL_MAX, POLAR_EL_MIN, POLAR_HALF_M, POLAR_N, POLAR_NODES,
  POLAR_OBSERVER_HEIGHT_M, POLAR_SPACING_M, chunkFile, chunkSize, statsLayout,
} from "../../src/services/science/polarGrid";
import type { MoonGeocentric } from "../../src/types";

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}

async function main(): Promise<void> {
  const threads = Number(arg("threads") ?? Math.max(1, os.cpus().length - 1));
  const rowsArg = arg("rows");
  const rows: number[] = [];
  if (rowsArg) {
    const [a, b] = rowsArg.split("-").map(Number);
    for (let j = a; j <= (b ?? a); j++) rows.push(j);
  } else for (let j = 0; j < POLAR_N; j++) rows.push(j);
  const testRun = !!rowsArg;

  log(`Loading 80 m grid (${DEM_FILES.m80}) into shared memory...`);
  const r80 = await loadRawGridShared(await CogReader.open(await fileSource(path.join(DEM_CACHE, DEM_FILES.m80))));
  log(`Loading 240 m grid (${DEM_FILES.m240}) into shared memory...`);
  const r240 = await loadRawGridShared(await CogReader.open(await fileSource(path.join(DEM_CACHE, DEM_FILES.m240))));
  const geo = await readJson<MoonGeocentric>(path.join(DATA_PUBLIC, "ephemeris", "moon-geocentric.json"));
  const sky = skyTables(geo);
  const share = (a: Float64Array) => {
    const s = new SharedArrayBuffer(a.byteLength);
    new Float64Array(s).set(a);
    return s;
  };
  const init = {
    g80: { buf: r80.data.buffer as SharedArrayBuffer, width: r80.width, height: r80.height, px: r80.px, X0: r80.X0, Y0: r80.Y0, box: BOX_80S - 200 },
    g240: { buf: r240.data.buffer as SharedArrayBuffer, width: r240.width, height: r240.height, px: r240.px, X0: r240.X0, Y0: r240.Y0, box: BOX_60S - 600 },
    sky: { count: sky.count, sun: share(sky.sun), earth: share(sky.earth) },
  };

  const masks = new Uint8Array(POLAR_NODES * POLAR_AZ_BINS);
  const sunC = new Uint16Array(POLAR_NODES);
  const earthC = new Uint16Array(POLAR_NODES);
  const bothC = new Uint16Array(POLAR_NODES);
  const dark = new Uint16Array(POLAR_NODES);
  const height = new Float32Array(POLAR_NODES).fill(NaN);
  let misses = 0;
  let maxSun = -90;
  let maxEarth = -90;
  let maxHorizon = -90;
  let noDem = 0;

  const t0 = Date.now();
  let done = 0;
  const queue = [...rows];
  await new Promise<void>((resolve, reject) => {
    let active = 0;
    const n = Math.min(threads, queue.length);
    log(`Computing ${rows.length} rows x ${POLAR_N} nodes on ${n} threads...`);
    for (let w = 0; w < n; w++) {
      const worker = new Worker(new URL("./polar-grid-worker.ts", import.meta.url), { workerData: init, execArgv: ["--import", "tsx"] });
      active++;
      const next = () => {
        const j = queue.shift();
        if (j === undefined) {
          void worker.terminate();
          if (--active === 0) resolve();
          return;
        }
        worker.postMessage(j);
      };
      worker.on("message", (r: { j: number; masks: Uint8Array; sun: Uint16Array; earth: Uint16Array; both: Uint16Array; dark: Uint16Array; height: Float32Array; misses: number; maxSun: number; maxEarth: number; maxHorizon: number; noDem: number }) => {
        const base = r.j * POLAR_N;
        masks.set(r.masks, base * POLAR_AZ_BINS);
        sunC.set(r.sun, base);
        earthC.set(r.earth, base);
        bothC.set(r.both, base);
        dark.set(r.dark, base);
        height.set(r.height, base);
        misses += r.misses;
        maxSun = Math.max(maxSun, r.maxSun);
        maxEarth = Math.max(maxEarth, r.maxEarth);
        maxHorizon = Math.max(maxHorizon, r.maxHorizon);
        noDem += r.noDem;
        done++;
        if (done % 10 === 0 || done === rows.length) {
          const el = (Date.now() - t0) / 1000;
          log(`  ${done}/${rows.length} rows, ${el.toFixed(0)} s elapsed, ~${((el / done) * (rows.length - done)).toFixed(0)} s left`);
        }
        next();
      });
      worker.on("error", reject);
      next();
    }
  });
  const seconds = (Date.now() - t0) / 1000;
  log(`Done in ${seconds.toFixed(0)} s. NaN ray samples ${misses}; nodes without DEM ${noDem}; max Sun el ${maxSun.toFixed(2)}, max Earth el ${maxEarth.toFixed(2)}, max horizon ${maxHorizon.toFixed(2)} deg`);

  // ---- encode ----
  const N = POLAR_NODES;
  const L = statsLayout(N);
  const statsBuf = Buffer.alloc(L.bytes);
  const toHalfPct = (c: number) => Math.round((c / sky.count) * 200);
  for (let k = 0; k < N; k++) {
    statsBuf[L.sun + k] = toHalfPct(sunC[k]);
    statsBuf[L.earth + k] = toHalfPct(earthC[k]);
    statsBuf[L.both + k] = toHalfPct(bothC[k]);
    statsBuf.writeUInt16LE(dark[k], L.dark + 2 * k);
    statsBuf.writeInt16LE(Number.isFinite(height[k]) ? Math.round(height[k]) : -32768, L.height + 2 * k);
  }
  const outDir = testRun ? path.join(DATA_RAW, "validation", "polar-test") : path.join(DATA_PUBLIC, "polar");
  await mkdir(path.join(outDir, "masks"), { recursive: true });
  const statsGz = gzipSync(statsBuf, { level: 9 });
  await writeFile(path.join(outDir, "stats.bin.gz"), statsGz);
  let maskBytesGz = 0;
  for (let cj = 0; cj < POLAR_CHUNKS; cj++) {
    for (let ci = 0; ci < POLAR_CHUNKS; ci++) {
      const w = chunkSize(ci);
      const h = chunkSize(cj);
      const buf = Buffer.alloc(w * h * POLAR_AZ_BINS);
      for (let lj = 0; lj < h; lj++) {
        for (let li = 0; li < w; li++) {
          const idx = (cj * POLAR_CHUNK + lj) * POLAR_N + (ci * POLAR_CHUNK + li);
          buf.set(masks.subarray(idx * POLAR_AZ_BINS, (idx + 1) * POLAR_AZ_BINS), (lj * w + li) * POLAR_AZ_BINS);
        }
      }
      const gz = gzipSync(buf, { level: 9 });
      maskBytesGz += gz.length;
      await writeFile(path.join(outDir, chunkFile(ci, cj)), gz);
    }
  }
  const meta = {
    version: 1,
    method: "Level B-grid: terrain horizon from LOLA 80 m (240 m beyond the 80S box) at 2 km nodes, 1-degree azimuth bins; hourly Sun/Earth from JPL Horizons sub-solar/sub-Earth points (skyAt).",
    projection: "South polar stereographic, R = 1737400 m (PGDA LOLA convention): x = rho sin(lon), y = rho cos(lon), rho = 2R tan(pi/4 + lat/2). Node (i,j): x = -halfM + i*spacingM, y = halfM - j*spacingM.",
    spacingM: POLAR_SPACING_M,
    halfM: POLAR_HALF_M,
    n: POLAR_N,
    nodes: N,
    azBins: POLAR_AZ_BINS,
    maskEncoding: `byte -> elevation deg = byte/10 + (${POLAR_EL_MIN}); range ${POLAR_EL_MIN}..${POLAR_EL_MAX}, clamped`,
    chunk: POLAR_CHUNK,
    chunks: POLAR_CHUNKS,
    chunkLayout: "masks/c_<ci>_<cj>.bin.gz: gzip of nodes row-major (lj, li), 360 bytes per node",
    stats: "stats.bin.gz: gzip of sun u8[N] | earth u8[N] | both u8[N] | pad(N odd) | longestDarkH u16le[N] | demHeightM i16le[N] (-32768 = no DEM). Fractions in half-percent (0..200).",
    observerHeightM: POLAR_OBSERVER_HEIGHT_M,
    rayLadder: "80 m steps to 8 km, then step = 1% of distance, to 300 km",
    timeWindow: { startUtc: geo.startUtc, stepS: geo.stepS, samples: sky.count },
    sunRule: "Sun visible = solar disc centre above terrain horizon (same as the 14 sites)",
    earthRule: "Earth visible = Earth centre above terrain horizon (geometric line of sight, not a radio link)",
    checks: { maxSunElDeg: round(maxSun, 3), maxEarthElDeg: round(maxEarth, 3), maxHorizonElDeg: round(maxHorizon, 3), nanRaySamples: misses, nodesWithoutDem: noDem },
    sourceIds: ["S34", "S50", "S21"],
    demFiles: [DEM_FILES.m80, DEM_FILES.m240],
    computeSeconds: Math.round(seconds),
    generated: new Date().toISOString(),
    bytes: { statsGz: statsGz.length, masksGz: maskBytesGz },
  };
  await writeFile(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
  log(`Wrote ${outDir}: stats ${(statsGz.length / 1024).toFixed(0)} KB, masks ${(maskBytesGz / 1048576).toFixed(1)} MB (gzip)`);
  if (!testRun) {
    await updateManifest([
      {
        kind: "polar-grid",
        file: "polar/meta.json",
        retrieved: new Date().toISOString(),
        sha256: sha256(statsGz),
        note: `South-polar Level B-grid: ${POLAR_N}x${POLAR_N} nodes at ${POLAR_SPACING_M} m, 1-deg horizon masks from ${DEM_FILES.m80} + ${DEM_FILES.m240} (S34), hourly Sun/Earth from moon-geocentric.json (S50). sha256 is of stats.bin.gz.`,
      },
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

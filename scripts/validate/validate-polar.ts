/** Validation battery for the south-polar Level B-grid (PG-1..PG-6).
 *  Writes qa/reports/polar-validation.md and data-raw/validation/polar-validation.json.
 *  Usage: npm run data:polar:validate */

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { BOX_60S, BOX_80S, DATA_PUBLIC, DATA_RAW, DEM_CACHE, DEM_FILES, ROOT, log, readJson, round } from "../lib/common";
import { CogReader, fileSource } from "../lib/bigtiff";
import { loadRawGridShared } from "../lib/demgrid";
import { computeNodeMask, kernelSky, skyTables, yearCounts, type RawGrid } from "../lib/polarKernel";
import {
  POLAR_AZ_BINS, POLAR_EL_MAX, POLAR_N, chunkFile, chunkOf, nearestNode, nodeIndex, nodeLatLon, nodeStats,
  offsetInChunk, parseStats,
} from "../../src/services/science/polarGrid";
import { skyAt } from "../../src/services/science/customPoint";
import { horizonElAt } from "../../src/services/science/core";
import { parseIsoUtc } from "../../src/lib/time";
import type { HorizonMask, MoonGeocentric, Site, SiteDerived } from "../../src/types";

interface Check {
  id: string;
  name: string;
  result: "PASS" | "FAIL" | "INFO";
  detail: string;
}

async function main(): Promise<void> {
  const checks: Check[] = [];
  const raw: Record<string, unknown> = {};
  const add = (c: Check) => {
    checks.push(c);
    log(`${c.id} ${c.result}: ${c.detail}`);
  };

  const r80 = await loadRawGridShared(await CogReader.open(await fileSource(path.join(DEM_CACHE, DEM_FILES.m80))));
  const r240 = await loadRawGridShared(await CogReader.open(await fileSource(path.join(DEM_CACHE, DEM_FILES.m240))));
  const g80: RawGrid = { ...r80, box: BOX_80S - 200 };
  const g240: RawGrid = { ...r240, box: BOX_60S - 600 };
  const geo = await readJson<MoonGeocentric>(path.join(DATA_PUBLIC, "ephemeris", "moon-geocentric.json"));
  const sky = skyTables(geo);
  const meta = await readJson<{ checks: { maxSunElDeg: number; maxEarthElDeg: number; maxHorizonElDeg: number; nodesWithoutDem: number; nanRaySamples: number } }>(path.join(DATA_PUBLIC, "polar", "meta.json"));
  const statsBuf = gunzipSync(await readFile(path.join(DATA_PUBLIC, "polar", "stats.bin.gz")));
  const stats = parseStats(statsBuf.buffer.slice(statsBuf.byteOffset, statsBuf.byteOffset + statsBuf.byteLength));
  const { sites } = await readJson<{ sites: Site[] }>(path.join(DATA_PUBLIC, "sites.json"));
  const chunkCache = new Map<string, Buffer>();
  const nodeMaskBytes = async (i: number, j: number) => {
    const { ci, cj, li, lj } = chunkOf(i, j);
    const f = chunkFile(ci, cj);
    if (!chunkCache.has(f)) chunkCache.set(f, gunzipSync(await readFile(path.join(DATA_PUBLIC, "polar", f))));
    const off = offsetInChunk(ci, li, lj);
    return chunkCache.get(f)!.subarray(off, off + POLAR_AZ_BINS);
  };
  const pct = (c: number) => (100 * c) / sky.count;
  /** Year counts against a full-resolution 0.1-degree site mask. */
  const yearCountsSiteMask = (lat: number, lon: number, mask: HorizonMask) => {
    let s = 0;
    let e = 0;
    for (let t = 0; t < sky.count; t++) {
      const k = kernelSky(lat, lon, sky, t);
      if (k.sun.elDeg > horizonElAt(mask, k.sun.azDeg)) s++;
      if (k.earth.elDeg > horizonElAt(mask, k.earth.azDeg)) e++;
    }
    return { sun: pct(s), earth: pct(e) };
  };

  // PG-1 / PG-2: grid method vs the published 20 m site masks (polar sites).
  const polarSites = sites.filter((s) => nearestNode(s.latDeg, s.lonDeg));
  for (const s of polarSites) {
    const siteMask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", `${s.id}.json`));
    const derived = await readJson<SiteDerived>(path.join(DATA_PUBLIC, "derived", `${s.id}.json`));
    const m = computeNodeMask(g80, g240, s.latDeg, s.lonDeg);
    let sq = 0;
    let mx = 0;
    let bias = 0;
    for (let k = 0; k < 360; k++) {
      const d = m.elDeg[k] - siteMask.horizonElDeg[k * 10];
      sq += d * d;
      bias += d;
      if (Math.abs(d) > Math.abs(mx)) mx = d;
    }
    const rms = Math.sqrt(sq / 360);
    const gridYear = yearCounts(s.latDeg, s.lonDeg, m.bytes, sky);
    const siteYear = yearCountsSiteMask(s.latDeg, s.lonDeg, siteMask);
    const derivedSun = (100 * derived.dailySunlitFrac.reduce((a, b) => a + b, 0)) / derived.dailySunlitFrac.length;
    const derivedEarth = (100 * derived.dailyEarthFrac.reduce((a, b) => a + b, 0)) / derived.dailyEarthFrac.length;
    const dSun = pct(gridYear.sun) - derivedSun;
    const dEarth = pct(gridYear.earth) - derivedEarth;
    raw[`PG-1 ${s.id}`] = { rms, maxDiff: mx, bias: bias / 360, gridSun: pct(gridYear.sun), siteMaskSun: siteYear.sun, derivedSun, gridEarth: pct(gridYear.earth), siteMaskEarth: siteYear.earth, derivedEarth, demHeight: m.demHeightM, siteDemHeight: siteMask.demHeightM };
    const ok = rms <= 0.5 && Math.abs(dSun) <= 5 && Math.abs(dEarth) <= 5;
    add({
      id: "PG-1",
      name: `Grid method at exact ${s.shortName} coordinate vs published site analysis`,
      result: ok ? "PASS" : "FAIL",
      detail: `horizon RMS ${rms.toFixed(3)}°, max ${mx.toFixed(2)}°, bias ${(bias / 360).toFixed(3)}° (grid 80 m/1° vs site 20 m/0.1°); year Sun ${pct(gridYear.sun).toFixed(1)}% vs site ${derivedSun.toFixed(1)}% (Δ ${dSun.toFixed(1)} pp), Earth ${pct(gridYear.earth).toFixed(1)}% vs ${derivedEarth.toFixed(1)}% (Δ ${dEarth.toFixed(1)} pp). Targets: RMS ≤ 0.5°, |Δ| ≤ 5 pp.`,
    });
    const nn = nearestNode(s.latDeg, s.lonDeg)!;
    const ns = nodeStats(stats, nn.idx);
    add({
      id: "PG-2",
      name: `Nearest grid node to ${s.shortName} (spatial representativeness)`,
      result: "INFO",
      detail: `node ${nn.i},${nn.j} is ${(nn.distM / 1000).toFixed(2)} km away: Sun ${(ns.sunlitFrac * 100).toFixed(1)}% vs site ${derivedSun.toFixed(1)}%, Earth ${(ns.earthFrac * 100).toFixed(1)}% vs ${derivedEarth.toFixed(1)}%. Differences here include real terrain change over up to 1.4 km.`,
    });
  }

  // PG-3: kernel sky engine == skyAt (app engine); flat-horizon stats == smooth reference.
  {
    let maxEl = 0;
    let maxAz = 0;
    const t0 = parseIsoUtc(geo.startUtc);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let q = 0; q < 2000; q++) {
      const i = Math.floor(rnd() * POLAR_N);
      const j = Math.floor(rnd() * POLAR_N);
      const t = Math.floor(rnd() * (sky.count - 1));
      const { latDeg, lonDeg } = nodeLatLon(i, j);
      const k = kernelSky(latDeg, lonDeg, sky, t);
      const a = skyAt(geo, latDeg, lonDeg, 0, t0 + t * geo.stepS * 1000);
      for (const [x, y] of [[k.sun, a.sun], [k.earth, a.earth]] as const) {
        maxEl = Math.max(maxEl, Math.abs(x.elDeg - y.elDeg));
        let d = Math.abs(x.azDeg - y.azDeg);
        if (d > 180) d = 360 - d;
        if (Math.abs(latDeg) < 89.99) maxAz = Math.max(maxAz, d);
      }
    }
    add({ id: "PG-3a", name: "Pipeline Sun/Earth engine equals the app's skyAt", result: maxEl < 1e-6 && maxAz < 1e-6 ? "PASS" : "FAIL", detail: `2000 random node/time pairs: max |Δel| ${maxEl.toExponential(2)}°, max |Δaz| ${maxAz.toExponential(2)}°` });
    const { latDeg, lonDeg } = nodeLatLon(100, 200);
    const flat = yearCounts(latDeg, lonDeg, null, sky);
    let s = 0;
    let e = 0;
    for (let t = 0; t < sky.count; t++) {
      const a = skyAt(geo, latDeg, lonDeg, 0, t0 + t * geo.stepS * 1000);
      if (a.sun.elDeg > 0) s++;
      if (a.earth.elDeg > 0) e++;
    }
    add({ id: "PG-3b", name: "Flat-horizon statistics equal the smooth-Moon reference", result: flat.sun === s && flat.earth === e ? "PASS" : "FAIL", detail: `node 100,200: flat ${flat.sun}/${flat.earth} vs skyAt el>0 ${s}/${e} hourly samples` });
  }

  // PG-4: sanity against known terrain (IAU Gazetteer centres, planetographic = planetocentric on the lunar sphere).
  {
    const known = [
      { name: "Cabeus crater floor (IAU 953: -85.33, -42.13)", lat: -85.33, lon: -42.13 },
      { name: "de Gerlache crater floor (IAU 1439: -88.48, -88.34)", lat: -88.48, lon: -88.34 },
    ];
    for (const k of known) {
      const nn = nearestNode(k.lat, k.lon)!;
      const ns = nodeStats(stats, nn.idx);
      add({ id: "PG-4", name: `${k.name} is in shadow all year`, result: ns.sunlitFrac === 0 ? "PASS" : "FAIL", detail: `nearest node ${(nn.distM / 1000).toFixed(1)} km away: Sun ${(ns.sunlitFrac * 100).toFixed(1)}%, longest dark ${ns.longestDarkH} h, DEM height ${ns.demHeightM} m` });
    }
    let zero = 0;
    let valid = 0;
    const top: { idx: number; v: number }[] = [];
    for (let idx = 0; idx < stats.n; idx++) {
      if (stats.height[idx] === -32768) continue;
      valid++;
      if (stats.sun[idx] === 0) zero++;
      top.push({ idx, v: stats.sun[idx] });
    }
    top.sort((a, b) => b.v - a.v);
    const best = top.slice(0, 5).map(({ idx, v }) => {
      const { latDeg, lonDeg } = nodeLatLon(idx % POLAR_N, Math.floor(idx / POLAR_N));
      return `${latDeg.toFixed(2)}, ${lonDeg.toFixed(1)}E: ${(v / 2).toFixed(1)}% (h ${stats.height[idx]} m)`;
    });
    const bestHigher = top.slice(0, 50).reduce((a, t) => a + stats.height[t.idx], 0) / 50;
    const meanH = top.reduce((a, t) => a + stats.height[t.idx], 0) / top.length;
    add({ id: "PG-4", name: "Best-lit nodes sit on high ground", result: bestHigher > meanH + 1000 ? "PASS" : "FAIL", detail: `top-50 mean height ${bestHigher.toFixed(0)} m vs all-node mean ${meanH.toFixed(0)} m. Best 5: ${best.join("; ")}. Nodes with 0% Sun: ${zero} of ${valid}.` });
    raw["PG-4 best"] = best;
  }

  // PG-5: the 20.5-degree clamp can never change a visibility result.
  add({ id: "PG-5", name: "Mask clamp is harmless", result: meta.checks.maxSunElDeg < POLAR_EL_MAX && meta.checks.maxEarthElDeg < POLAR_EL_MAX ? "PASS" : "FAIL", detail: `max Sun el ${meta.checks.maxSunElDeg}°, max Earth el ${meta.checks.maxEarthElDeg}° over all nodes and hours (< ${POLAR_EL_MAX}°); highest horizon ${meta.checks.maxHorizonElDeg}° (clamped in storage). NaN ray samples ${meta.checks.nanRaySamples}, nodes without DEM ${meta.checks.nodesWithoutDem}.` });

  // PG-6: shipped files decode to exactly what the kernel produces (determinism + layout).
  {
    let mism = 0;
    let statMism = 0;
    const picks = [[0, 0], [150, 150], [300, 300], [37, 211], [212, 64], [299, 5], [5, 299], [123, 177]];
    for (const [i, j] of picks) {
      const { latDeg, lonDeg } = nodeLatLon(i, j);
      const m = computeNodeMask(g80, g240, latDeg, lonDeg);
      const b = await nodeMaskBytes(i, j);
      for (let k = 0; k < 360; k++) if (b[k] !== m.bytes[k]) mism++;
      const c = yearCounts(latDeg, lonDeg, m.bytes, sky);
      const s = nodeStats(stats, nodeIndex(i, j));
      if (Math.round((c.sun / sky.count) * 200) / 200 !== s.sunlitFrac || c.longestDarkH !== s.longestDarkH || Math.round(m.demHeightM) !== s.demHeightM) statMism++;
    }
    add({ id: "PG-6", name: "Shipped masks and stats decode to the recomputed values", result: mism === 0 && statMism === 0 ? "PASS" : "FAIL", detail: `${picks.length} nodes incl. corners/pole: ${mism} mask byte mismatches, ${statMism} stats mismatches` });
  }

  const fails = checks.filter((c) => c.result === "FAIL").length;
  const md = [
    "# South-polar grid validation (PG-1..PG-6)",
    "",
    `Generated ${new Date().toISOString()} by \`npm run data:polar:validate\`. ${checks.length} checks: ${checks.filter((c) => c.result === "PASS").length} PASS, ${fails} FAIL, ${checks.filter((c) => c.result === "INFO").length} INFO.`,
    "",
    "| ID | Check | Result | Detail |",
    "|---|---|---|---|",
    ...checks.map((c) => `| ${c.id} | ${c.name} | ${c.result} | ${c.detail.replace(/\|/g, "/")} |`),
    "",
    "Notes: the grid is a regional comparison layer (80 m DEM, 2 km nodes, 1° bins, hourly). The 14 sites keep their 20 m / 0.1° / Horizons topocentric analysis as the reference. IAU feature centres from the Gazetteer of Planetary Nomenclature (planetographic = planetocentric for the lunar reference sphere).",
    "",
  ].join("\n");
  await mkdir(path.join(ROOT, "qa", "reports"), { recursive: true });
  await writeFile(path.join(ROOT, "qa", "reports", "polar-validation.md"), md);
  await writeFile(path.join(DATA_RAW, "validation", "polar-validation.json"), JSON.stringify({ checks, raw: JSON.parse(JSON.stringify(raw, (_k, v) => (typeof v === "number" ? round(v, 4) : v))) }, null, 2));
  log(`Validation: ${fails} FAIL. Report: qa/reports/polar-validation.md`);
  if (fails) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

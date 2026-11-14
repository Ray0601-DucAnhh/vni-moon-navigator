/** Fetch Sun/Earth topocentric ephemerides for each analysed site, and the
 *  geocentric sub-solar / sub-Earth points, from the JPL Horizons API
 *  (official challenge resource, S21/S22/S50). Raw responses are kept
 *  verbatim under data-raw/horizons/; parsed series go to public/data/.
 *
 *  Header assertions (SV-1) run on every response: frame MEAN_ME, radius
 *  1737.4 km, AIRLESS, site coordinates echoed back, target as requested.
 *
 *  Usage: npm run data:ephemeris [-- --site=im2]
 *  Extra: --extra=<id>,<lat>,<lon>,<altKm>,<stepMin>  (validation points;
 *         raw+parsed under data-raw/validation/) */

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  DATA_PUBLIC, DATA_RAW, EPH_START, EPH_STEP_MIN, EPH_STOP, GEO_STEP_MIN,
  log, readJson, round, sha256, updateManifest, writeJson,
} from "../lib/common";
import { parseHorizonsDate, parseIsoUtc, toIsoUtc } from "../../src/lib/time";
import type { HorizonMask, Site } from "../../src/types";

const API = "https://ssd.jpl.nasa.gov/api/horizons.api";

interface Series {
  tMs: number[];
  a: number[]; // az or sub-solar lon
  b: number[]; // el or sub-solar lat
  c?: number[]; // sub-earth lon
  d?: number[]; // sub-earth lat
  raw: string;
  url: string;
}

function quarters(startIso: string, stopIso: string): [string, string][] {
  const edges = [
    "2026-11-01", "2027-02-01", "2027-05-01", "2027-08-01", "2027-11-01",
  ];
  const out: [string, string][] = [];
  for (let i = 0; i < edges.length - 1; i++) out.push([edges[i], edges[i + 1]]);
  // sanity: window must match common.ts
  if (!startIso.startsWith(edges[0]) || !stopIso.startsWith(edges[edges.length - 1])) {
    throw new Error("Quarter edges out of sync with EPH_START/EPH_STOP");
  }
  return out;
}

async function fetchChunk(params: Record<string, string>, tag: string): Promise<{ text: string; url: string }> {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(`'${v}'`)}`)
    .join("&");
  const url = `${API}?format=text&${qs}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    const text = await res.text();
    if (res.ok && text.includes("$$SOE")) return { text, url };
    if (attempt >= 3) throw new Error(`${tag}: Horizons failed (${res.status}); first 300 chars:\n${text.slice(0, 300)}`);
    log(`${tag}: retry ${attempt} (${res.status})`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

function assertHeader(text: string, tag: string, expect: { lonE?: number; latDeg?: number; target: string }): void {
  const must = (cond: boolean, what: string) => {
    if (!cond) throw new Error(`SV-1 FAIL ${tag}: ${what}`);
  };
  must(text.includes("MEAN_ME") || text.includes("MOON_ME"), "lunar body-fixed frame (MEAN_ME/MOON_ME) not in header");
  must(/Center radii\s*:\s*1737\.4/.test(text) || /Target radii\s*:\s*1737\.4/.test(text), "radius 1737.4 km not in header");
  if (expect.lonE !== undefined) must(/Atmos refraction:\s*NO \(AIRLESS\)/.test(text), "not AIRLESS");
  must(text.includes(expect.target), `target "${expect.target}" not in header`);
  if (expect.lonE !== undefined && expect.latDeg !== undefined) {
    const m = text.match(/Center geodetic\s*:\s*([-\d.]+),\s*([-\d.]+)/);
    must(!!m, "no Center geodetic line");
    if (m) {
      let lon = Number(m[1]);
      if (lon > 180) lon -= 360;
      must(Math.abs(lon - expect.lonE) < 1e-3, `site lon ${m[1]} != ${expect.lonE}`);
      must(Math.abs(Number(m[2]) - expect.latDeg) < 1e-3, `site lat ${m[2]} != ${expect.latDeg}`);
    }
  }
}

function parseTable(text: string, cols: number, tag: string): { tMs: number[]; vals: number[][] } {
  const i = text.indexOf("$$SOE");
  const j = text.indexOf("$$EOE");
  if (i < 0 || j < 0) throw new Error(`${tag}: no $$SOE/$$EOE`);
  const tMs: number[] = [];
  const vals: number[][] = Array.from({ length: cols }, () => []);
  for (const line of text.slice(i + 5, j).split("\n")) {
    const s = line.trim();
    if (!s) continue;
    const parts = s.split(",").map((p) => p.trim());
    // CSV: date, presence flags (2 empty-ish cols), then numeric columns.
    const nums = parts.slice(3, 3 + cols).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) throw new Error(`${tag}: bad row "${s.slice(0, 80)}"`);
    tMs.push(parseHorizonsDate(parts[0]));
    nums.forEach((n, k) => vals[k].push(n));
  }
  return { tMs, vals };
}

async function fetchSeries(
  tag: string,
  command: string,
  targetName: string,
  site: { lonE: number; latDeg: number; altKm: number } | null,
  stepMin: number,
  startIso: string,
  stopIso: string,
  quantities: string,
  rawDir: string,
): Promise<Series> {
  const chunks = quarters(startIso, stopIso);
  const tMs: number[] = [];
  const cols = quantities === "4" ? 2 : 4;
  const vals: number[][] = Array.from({ length: cols }, () => []);
  let rawAll = "";
  let lastUrl = "";
  for (let q = 0; q < chunks.length; q++) {
    const [a, b] = chunks[q];
    const params: Record<string, string> = {
      COMMAND: command,
      OBJ_DATA: "NO",
      MAKE_EPHEM: "YES",
      EPHEM_TYPE: "OBSERVER",
      CENTER: site ? "coord@301" : "500@399",
      START_TIME: a,
      STOP_TIME: b,
      STEP_SIZE: `${stepMin} min`,
      QUANTITIES: quantities,
      CSV_FORMAT: "YES",
    };
    if (site) {
      params.COORD_TYPE = "GEODETIC";
      params.SITE_COORD = `${site.lonE},${site.latDeg},${round(site.altKm, 6)}`;
    }
    const { text, url } = await fetchChunk(params, `${tag} q${q + 1}`);
    lastUrl = url;
    assertHeader(text, `${tag} q${q + 1}`, {
      target: targetName,
      lonE: site?.lonE,
      latDeg: site?.latDeg,
    });
    const rawPath = path.join(rawDir, `${tag}_q${q + 1}.txt`);
    await mkdir(path.dirname(rawPath), { recursive: true });
    await writeFile(rawPath, text);
    rawAll += text;
    const t = parseTable(text, cols, tag);
    for (let i = 0; i < t.tMs.length; i++) {
      if (tMs.length > 0 && t.tMs[i] <= tMs[tMs.length - 1]) continue; // dedupe quarter boundary
      tMs.push(t.tMs[i]);
      for (let k = 0; k < cols; k++) vals[k].push(t.vals[k][i]);
    }
    log(`${tag} q${q + 1}: ${t.tMs.length} rows`);
  }
  // Continuity check: constant step, no gaps.
  const stepMs = stepMin * 60_000;
  for (let i = 1; i < tMs.length; i++) {
    if (tMs[i] - tMs[i - 1] !== stepMs) {
      throw new Error(`${tag}: gap at ${toIsoUtc(tMs[i - 1])} -> ${toIsoUtc(tMs[i])}`);
    }
  }
  return { tMs, a: vals[0], b: vals[1], c: vals[2], d: vals[3], raw: rawAll, url: lastUrl };
}

function parseArgs(): { site: string | null; extras: { id: string; lat: number; lon: number; altKm: number; stepMin: number }[] } {
  let site: string | null = null;
  const extras: { id: string; lat: number; lon: number; altKm: number; stepMin: number }[] = [];
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--site=")) site = a.slice(7);
    else if (a.startsWith("--extra=")) {
      const [id, lat, lon, altKm, stepMin] = a.slice(8).split(",");
      extras.push({ id, lat: Number(lat), lon: Number(lon), altKm: Number(altKm), stepMin: Number(stepMin || "60") });
    }
  }
  return { site, extras };
}

async function main(): Promise<void> {
  const { site, extras } = parseArgs();
  const sitesDoc = await readJson<{ sites: Site[] }>(path.join(DATA_PUBLIC, "sites.json"));
  const analysed = sitesDoc.sites.filter((s) => s.analysed && (!site || s.id === site));
  const rawDir = path.join(DATA_RAW, "horizons");

  for (const s of analysed) {
    const mask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", `${s.id}.json`));
    const altKm = (mask.demHeightM + mask.observerHeightM) / 1000;
    const siteCoord = { lonE: s.lonDeg, latDeg: s.latDeg, altKm };
    log(`${s.id}: fetching Sun & Earth az/el (alt ${altKm.toFixed(4)} km, step ${EPH_STEP_MIN} min)`);
    const sun = await fetchSeries(`${s.id}_sun`, "10", "Sun (10)", siteCoord, EPH_STEP_MIN, EPH_START, EPH_STOP, "4", rawDir);
    const earth = await fetchSeries(`${s.id}_earth`, "399", "Earth (399)", siteCoord, EPH_STEP_MIN, EPH_START, EPH_STOP, "4", rawDir);
    if (sun.tMs.length !== earth.tMs.length || sun.tMs[0] !== earth.tMs[0]) {
      throw new Error(`${s.id}: sun/earth sample grids differ`);
    }
    const eph = {
      siteId: s.id,
      startUtc: toIsoUtc(sun.tMs[0], true),
      stepS: EPH_STEP_MIN * 60,
      count: sun.tMs.length,
      sunAz: sun.a.map((v) => round(v, 4)),
      sunEl: sun.b.map((v) => round(v, 4)),
      earthAz: earth.a.map((v) => round(v, 4)),
      earthEl: earth.b.map((v) => round(v, 4)),
    };
    await writeJson(path.join(DATA_PUBLIC, "ephemeris", `${s.id}.json`), eph);
    await updateManifest([
      {
        kind: "ephemeris",
        file: `ephemeris/${s.id}.json`,
        source: "JPL Horizons API (DE441), QUANTITIES=4 (apparent az/el), MEAN_ME site frame",
        retrieved: new Date().toISOString(),
        sha256: sha256(sun.raw + earth.raw),
        rows: eph.count,
        window: `${EPH_START} .. ${EPH_STOP} step ${EPH_STEP_MIN} min`,
        siteCoord: `${siteCoord.lonE} E, ${siteCoord.latDeg}, alt ${round(altKm, 5)} km (DEM height + ${mask.observerHeightM} m)`,
        note: "Raw responses in data-raw/horizons/ (SV-1 header checks passed at fetch time).",
      },
    ]);
    log(`${s.id}: wrote ephemeris (${eph.count} samples)`);
  }

  if (!site || site === "geo") {
    log(`geocentric: fetching sub-solar / sub-Earth points (step ${GEO_STEP_MIN} min)`);
    const geo = await fetchSeries("moon_geo", "301", "Moon (301)", null, GEO_STEP_MIN, EPH_START, EPH_STOP, "14,15", rawDir);
    const doc = {
      startUtc: toIsoUtc(geo.tMs[0], true),
      stepS: GEO_STEP_MIN * 60,
      count: geo.tMs.length,
      // Horizons 14/15: ObsSub-LON, ObsSub-LAT, SunSub-LON, SunSub-LAT.
      subEarthLonE: geo.a.map((v) => round(v, 4)),
      subEarthLat: geo.b.map((v) => round(v, 4)),
      subSolarLonE: (geo.c ?? []).map((v) => round(v, 4)),
      subSolarLat: (geo.d ?? []).map((v) => round(v, 4)),
    };
    await writeJson(path.join(DATA_PUBLIC, "ephemeris", "moon-geocentric.json"), doc);
    await updateManifest([
      {
        kind: "ephemeris",
        file: "ephemeris/moon-geocentric.json",
        source: "JPL Horizons API, Moon observed from Earth centre, QUANTITIES=14,15 (sub-observer & sub-solar points, MOON_ME)",
        retrieved: new Date().toISOString(),
        sha256: sha256(geo.raw),
        rows: doc.count,
        note: "Drives globe lighting (sub-solar) and the Earth-direction arrow (sub-Earth).",
      },
    ]);
    log(`geocentric: wrote ${doc.count} samples`);
  }

  for (const ex of extras) {
    const tag = `${ex.id}_sun`;
    log(`extra ${ex.id}: Sun az/el at step ${ex.stepMin} min`);
    const sun = await fetchSeries(tag, "10", "Sun (10)", { lonE: ex.lon, latDeg: ex.lat, altKm: ex.altKm }, ex.stepMin, EPH_START, EPH_STOP, "4", path.join(DATA_RAW, "validation"));
    await writeJson(path.join(DATA_RAW, "validation", `eph-${ex.id}-sun.json`), {
      siteId: ex.id,
      startUtc: toIsoUtc(sun.tMs[0], true),
      stepS: ex.stepMin * 60,
      count: sun.tMs.length,
      sunAz: sun.a.map((v) => round(v, 4)),
      sunEl: sun.b.map((v) => round(v, 4)),
    });
  }

  // Keep the parsed window in sync for the app's clamping.
  const startMs = parseIsoUtc(EPH_START);
  log(`Window: ${EPH_START} .. last sample ${toIsoUtc(startMs)} + n-1 steps (see files).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** Build per-site terrain horizon masks from the LOLA south-polar DEMs.
 *
 *  Method (plan v1.1 §4.2 / docs/methods.md):
 *  - Observer at site lat/lon, height = DEM height + 2 m.
 *  - 3600 azimuths (0.1 deg). Each ray marches along the great circle:
 *    10 m steps to 20 km (20 m DEM window), then 40 m steps to 300 km
 *    (80 m DEM inside the 80S box, 240 m DEM beyond).
 *  - Elevation of each sample P vs the observer's local horizontal plane:
 *    el = asin( ((P-O).uO) / |P-O| ), P = (R+h)uP, O = (R+h0)uO.
 *    Lunar curvature is inherent; airless, no refraction.
 *  - H(az) = max el along the ray. NaN DEM samples fall through to the next
 *    coarser layer; remaining misses are counted.
 *
 *  Variants for validation:
 *    --variant=no20   near field from the 80 m DEM only (TV-5)
 *    --variant=r150 | --variant=r500   max range 150 / 500 km (TV-6)
 *    --site=<id>      limit to one site
 *    --extra=<id>,<lat>,<lon>  add an extra point (e.g. PSR check, TV-7;
 *                     offsets for TV-8), written to data-raw/validation/
 *
 *  Usage: npm run data:horizon [-- --variant=... --site=... --extra=...] */

import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  AZ_STEP_DEG, BOX_60S, BOX_80S, DATA_PUBLIC, DATA_RAW, DEM_CACHE, DEM_FILES,
  FAR_STEP_M, MAX_RANGE_M, NEAR_RANGE_M, NEAR_STEP_M, OBSERVER_HEIGHT_M,
  PGDA_BASE, WINDOW_HALF_M, log, readJson, round, updateManifest, writeJson,
} from "../lib/common";
import { CogReader, fileSource, httpSource, type RangeSource } from "../lib/bigtiff";
import { lazySampler, loadFullGrid, mosaic, type Sampler } from "../lib/demgrid";
import { R_MOON_M, latLonToUnit, smoothDipDeg, southStereo, southStereoInverse } from "../../src/lib/coords";
import type { Site } from "../../src/types";

interface Target {
  id: string;
  latDeg: number;
  lonDeg: number;
  toPublic: boolean;
}

function parseArgs(): { variant: string; site: string | null; extras: Target[] } {
  let variant = "default";
  let site: string | null = null;
  const extras: Target[] = [];
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--variant=")) variant = a.slice(10);
    else if (a.startsWith("--site=")) site = a.slice(7);
    else if (a.startsWith("--extra=")) {
      const [id, lat, lon] = a.slice(8).split(",");
      extras.push({ id, latDeg: Number(lat), lonDeg: Number(lon), toPublic: false });
    }
  }
  return { variant, site, extras };
}

/** RangeSource over HTTP with the first 4 MB cached on disk (header+IFDs). */
async function cachedHeaderHttpSource(url: string, cacheName: string): Promise<RangeSource> {
  const inner = httpSource(url);
  const cachePath = path.join(DEM_CACHE, cacheName);
  let head: Buffer | null = null;
  if (existsSync(cachePath)) head = await readFile(cachePath);
  else {
    head = await inner.read(0, 4 * 1024 * 1024);
    await mkdir(DEM_CACHE, { recursive: true });
    await writeFile(cachePath, head);
  }
  const h = head;
  return {
    size: () => inner.size(),
    read: async (off, len) =>
      off + len <= h.length ? h.subarray(off, off + len) : inner.read(off, len),
    describe: () => url,
    close: async () => {},
  };
}

/** Open the remote 20 m DEM and prefetch (disk-cached) all tiles covering a
 *  window around (sx,sy); returns a bilinear sampler over the window. */
async function open20mWindow(
  sx: number,
  sy: number,
  tag: string,
): Promise<{ sampler: Sampler; tiles: number }> {
  const url = `${PGDA_BASE}/${DEM_FILES.m20}`;
  const tileDir = path.join(DEM_CACHE, "tiles20");
  await mkdir(tileDir, { recursive: true });
  const provider = async (idx: number): Promise<Buffer | null> => {
    const p = path.join(tileDir, `tile_${idx}.bin`);
    return existsSync(p) ? readFile(p) : null;
  };
  const src = await cachedHeaderHttpSource(url, "LDEM_80S_20MPP_ADJ.header.bin");
  const reader = await CogReader.open(src, { rawTileProvider: provider });
  const { tileWidth, tileHeight, tilesAcross, tilesDown, pixelScale, tiepoint } = reader.info;
  const px = pixelScale[0];
  const colMin = Math.max(0, Math.floor((sx - WINDOW_HALF_M - tiepoint[0]) / px / tileWidth));
  const colMax = Math.min(tilesAcross - 1, Math.floor((sx + WINDOW_HALF_M - tiepoint[0]) / px / tileWidth));
  const rowMin = Math.max(0, Math.floor((tiepoint[1] - (sy + WINDOW_HALF_M)) / px / tileHeight));
  const rowMax = Math.min(tilesDown - 1, Math.floor((tiepoint[1] - (sy - WINDOW_HALF_M)) / px / tileHeight));
  const decoded = new Map<number, Float32Array>();
  let fetched = 0;
  for (let r = rowMin; r <= rowMax; r++) {
    for (let c = colMin; c <= colMax; c++) {
      const idx = r * tilesAcross + c;
      const p = path.join(tileDir, `tile_${idx}.bin`);
      if (!existsSync(p)) {
        await writeFile(p, await reader.rawTile(idx));
        fetched++;
      }
      decoded.set(idx, (await reader.tile(idx)) as Float32Array);
    }
  }
  log(`${tag}: 20 m window tiles ${(rowMax - rowMin + 1) * (colMax - colMin + 1)} (${fetched} newly fetched)`);
  return { sampler: lazySampler(reader, decoded, "LDEM_80S_20MPP_ADJ(window)"), tiles: decoded.size };
}

/** Mean of a 3x3 pixel block of the remote EFFRES layer at (sx,sy). */
async function effectiveResAt(sx: number, sy: number): Promise<number | null> {
  try {
    const src = await cachedHeaderHttpSource(
      `${PGDA_BASE}/${DEM_FILES.effres20}`,
      "LDEM_80S_20MPP_ADJ_EFFRES.header.bin",
    );
    const reader = await CogReader.open(src);
    const px = reader.info.pixelScale[0];
    const col = Math.round((sx - reader.info.tiepoint[0]) / px - 0.5);
    const row = Math.round((reader.info.tiepoint[1] - sy) / px - 0.5);
    let sum = 0;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const v = await reader.pixel(col + dc, row + dr);
        if (Number.isFinite(v)) {
          sum += v;
          n++;
        }
      }
    }
    return n > 0 ? round(sum / n, 1) : null;
  } catch (e) {
    log(`EFFRES read failed (non-fatal): ${(e as Error).message}`);
    return null;
  }
}

interface MaskResult {
  mask: Record<string, unknown>;
  demHeightM: number;
}

export function buildMask(
  target: Target,
  sampler: Sampler & { misses: () => number },
  demHeightM: number,
  maxRangeM: number,
  demFiles: string[],
  effectiveResM: number | null,
  azStepDeg: number = AZ_STEP_DEG,
): MaskResult {
  const h0 = demHeightM + OBSERVER_HEIGHT_M;
  const rO = R_MOON_M + h0;
  const uO = latLonToUnit(target.latDeg, target.lonDeg);
  const la = (target.latDeg * Math.PI) / 180;
  const lo = (target.lonDeg * Math.PI) / 180;
  const e = { x: -Math.sin(lo), y: Math.cos(lo), z: 0 };
  const n = { x: -Math.sin(la) * Math.cos(lo), y: -Math.sin(la) * Math.sin(lo), z: Math.cos(la) };

  // Distance ladder: 10 m steps to NEAR_RANGE, then 40 m steps to maxRange.
  const dists: number[] = [];
  for (let d = NEAR_STEP_M; d <= NEAR_RANGE_M; d += NEAR_STEP_M) dists.push(d);
  for (let d = NEAR_RANGE_M + FAR_STEP_M; d <= maxRangeM; d += FAR_STEP_M) dists.push(d);
  const cosS = dists.map((d) => Math.cos(d / R_MOON_M));
  const sinS = dists.map((d) => Math.sin(d / R_MOON_M));

  const nAz = Math.round(360 / azStepDeg);
  const horizonEl = new Float64Array(nAz);
  const horizonDist = new Float64Array(nAz);
  const tv4: Record<string, unknown>[] = [];
  const t0 = Date.now();

  for (let k = 0; k < nAz; k++) {
    const A = ((k * azStepDeg) * Math.PI) / 180;
    const tx = e.x * Math.sin(A) + n.x * Math.cos(A);
    const ty = e.y * Math.sin(A) + n.y * Math.cos(A);
    const tz = e.z * Math.sin(A) + n.z * Math.cos(A);
    let best = -90;
    let bestD = 0;
    let bestInfo: { x: number; y: number; h: number } | null = null;
    for (let i = 0; i < dists.length; i++) {
      const ux = uO.x * cosS[i] + tx * sinS[i];
      const uy = uO.y * cosS[i] + ty * sinS[i];
      const uz = uO.z * cosS[i] + tz * sinS[i];
      // South polar stereographic directly from the unit vector:
      // x = 2R*uy/(1-uz), y = 2R*ux/(1-uz)  (equivalent to rho*sin/cos lon).
      const w = (2 * R_MOON_M) / (1 - uz);
      const x = w * uy;
      const y = w * ux;
      const s = sampler.heightAt(x, y);
      if (!s.ok) continue;
      const rP = R_MOON_M + s.h;
      const dx = rP * ux - rO * uO.x;
      const dy = rP * uy - rO * uO.y;
      const dz = rP * uz - rO * uO.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const el = Math.asin(Math.max(-1, Math.min(1, (dx * uO.x + dy * uO.y + dz * uO.z) / len))) * (180 / Math.PI);
      if (el > best) {
        best = el;
        bestD = dists[i];
        bestInfo = { x, y, h: s.h };
      }
    }
    horizonEl[k] = best;
    horizonDist[k] = bestD;
    // TV-4 export: the horizon-forming point for three spot azimuths.
    if (nAz === 3600 && (k === 300 || k === 1500 || k === 2700) && bestInfo) {
      const ll = southStereoInverse(bestInfo.x, bestInfo.y);
      tv4.push({
        azDeg: k * azStepDeg,
        horizonElDeg: round(best, 4),
        distM: bestD,
        pointLatDeg: round(ll.latDeg, 6),
        pointLonDeg: round(ll.lonDeg, 6),
        pointHeightM: round(bestInfo.h, 2),
        observerLatDeg: target.latDeg,
        observerLonDeg: target.lonDeg,
        observerHeightM: round(h0, 2),
      });
    }
  }
  log(
    `${target.id}: mask built in ${((Date.now() - t0) / 1000).toFixed(1)} s; ` +
      `horizon el min ${round(Math.min(...horizonEl), 3)} max ${round(Math.max(...horizonEl), 3)} deg; misses ${sampler.misses()}`,
  );

  return {
    demHeightM,
    mask: {
      siteId: target.id,
      azStepDeg,
      horizonElDeg: Array.from(horizonEl, (v) => round(v, 4)),
      horizonDistKm: Array.from(horizonDist, (v) => round(v / 1000, 2)),
      observerHeightM: OBSERVER_HEIGHT_M,
      demHeightM: round(demHeightM, 1),
      smoothRefDeg: round(smoothDipDeg(demHeightM, OBSERVER_HEIGHT_M), 4),
      demFiles,
      effectiveResM,
      maxRangeKm: maxRangeM / 1000,
      nanSamples: sampler.misses(),
      generated: new Date().toISOString(),
      tv4,
    },
  };
}

async function main(): Promise<void> {
  const { variant, site, extras } = parseArgs();
  const sitesDoc = await readJson<{ sites: Site[] }>(path.join(DATA_PUBLIC, "sites.json"));
  const targets: Target[] = sitesDoc.sites
    .filter((s) => s.analysed && (!site || s.id === site))
    .map((s) => ({ id: s.id, latDeg: s.latDeg, lonDeg: s.lonDeg, toPublic: variant === "default" }));
  targets.push(...extras);
  if (targets.length === 0) throw new Error("No targets selected");

  log(`Loading full 80 m grid (${DEM_FILES.m80})...`);
  const src80 = await fileSource(path.join(DEM_CACHE, DEM_FILES.m80));
  const grid80 = await loadFullGrid(await CogReader.open(src80), DEM_FILES.m80);
  log(`Loading full 240 m grid (${DEM_FILES.m240})...`);
  const src240 = await fileSource(path.join(DEM_CACHE, DEM_FILES.m240));
  const grid240 = await loadFullGrid(await CogReader.open(src240), DEM_FILES.m240);

  const maxRange = variant === "r150" ? 150_000 : variant === "r500" ? 500_000 : MAX_RANGE_M;

  for (const t of targets) {
    const { x: sx, y: sy } = southStereo(t.latDeg, t.lonDeg);
    const use20 = variant !== "no20";
    let near: Sampler | null = null;
    if (use20) near = (await open20mWindow(sx, sy, t.id)).sampler;

    const layers = [
      ...(near
        ? [{
            sampler: near,
            contains: (x: number, y: number) =>
              Math.abs(x - sx) <= WINDOW_HALF_M - 1000 && Math.abs(y - sy) <= WINDOW_HALF_M - 1000,
          }]
        : []),
      { sampler: grid80, contains: (x: number, y: number) => Math.abs(x) <= BOX_80S - 200 && Math.abs(y) <= BOX_80S - 200 },
      { sampler: grid240, contains: (x: number, y: number) => Math.abs(x) <= BOX_60S - 600 && Math.abs(y) <= BOX_60S - 600 },
    ];
    const stack = mosaic(layers);

    const hSite = (near ?? grid80).heightAt(sx, sy);
    if (!hSite.ok) throw new Error(`${t.id}: no DEM height at site`);
    const effres = t.toPublic && use20 ? await effectiveResAt(sx, sy) : null;

    const demFiles = [
      ...(use20 ? [DEM_FILES.m20 + " (window)"] : []),
      DEM_FILES.m80,
      DEM_FILES.m240,
    ];
    const { mask } = buildMask(t, stack, hSite.h, maxRange, demFiles, effres);

    if (t.toPublic && variant === "default") {
      const out = path.join(DATA_PUBLIC, "horizon", `${t.id}.json`);
      await writeJson(out, mask);
      await updateManifest([
        {
          kind: "horizon-mask",
          file: `horizon/${t.id}.json`,
          retrieved: new Date().toISOString(),
          note: `Terrain horizon; az step ${AZ_STEP_DEG} deg; observer +${OBSERVER_HEIGHT_M} m; range ${maxRange / 1000} km; DEMs: ${demFiles.join(", ")} (S34).`,
          demHeightM: round(hSite.h, 1),
          effectiveResM: effres,
        },
      ]);
      log(`${t.id}: wrote ${out} (site DEM height ${round(hSite.h, 1)} m, EFFRES ${effres ?? "n/a"} m)`);
    } else {
      const out = path.join(DATA_RAW, "validation", `horizon-${t.id}-${variant}.json`);
      await writeJson(out, mask);
      log(`${t.id}: wrote ${out}`);
    }
  }
  await src80.close();
  await src240.close();
}

// Run only when invoked as a script (vitest imports buildMask for TV-2/TV-3).
if (process.argv[1] && /build-horizon-masks/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

/** SLDEM2015 window reader (LOLA + SELENE TC merged DEM, 60S-60N).
 *  Source: http://imbrium.mit.edu/DATA/SLDEM2015/ (PGDA product 54, S33;
 *  Barker et al. 2016, Icarus 273:346-355).
 *
 *  Format, from the PDS3 labels (checked 2026-11-15):
 *  - FLOAT_IMG: uncompressed little-endian float32 (PC_REAL), heights in KM
 *    relative to a 1737.4 km sphere; "MEAN EARTH/POLAR AXIS OF DE421".
 *  - Simple cylindrical, pixel-registered, row 0 = northernmost row,
 *    longitudes east-positive 0..360.
 *  - 512 ppd tiles: 30 deg (lat) x 45 deg (lon), 15360 x 23040 px, bands
 *    00N_30N, 30N_60N, 30S_00S, 60S_30S.
 *  - 128 ppd global: 60S-60N x 0-360, 15360 x 46080 px.
 *
 *  Because the files are uncompressed, any window is a set of contiguous
 *  byte ranges (one per row), fetched with HTTP Range requests and cached
 *  locally (gitignored) as a little-endian float32 grid in metres. */

import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DEM_CACHE, log, sha256 } from "./common";
import type { HeightSample, UnitLayer } from "./demgrid";

export const SLDEM_BASE = "http://imbrium.mit.edu/DATA/SLDEM2015";

export interface LatLonGrid {
  ppd: number;
  /** Latitude of the NORTH edge of row 0 (deg). */
  latTop: number;
  /** Longitude (0..360 continuous, may exceed 360 when wrapping) of the WEST edge of col 0. */
  lonWest: number;
  rows: number;
  cols: number;
  /** Heights in metres vs 1737.4 km, row-major. NaN = no data. */
  data: Float32Array;
  source: string;
}

interface FileSpec {
  url: string;
  latMax: number;
  lonWest: number;
  width: number;
  height: number;
  ppd: number;
}

function tileSpecs512(): FileSpec[] {
  const bands: [string, number][] = [
    ["30N_60N", 60],
    ["00N_30N", 30],
    ["30S_00S", 0],
    ["60S_30S", -30],
  ];
  const out: FileSpec[] = [];
  for (const [band, latMax] of bands) {
    for (let lon = 0; lon < 360; lon += 45) {
      const a = String(lon).padStart(3, "0");
      const b = String(lon + 45).padStart(3, "0");
      out.push({
        url: `${SLDEM_BASE}/TILES/FLOAT_IMG/SLDEM2015_512_${band}_${a}_${b}_FLOAT.IMG`,
        latMax,
        lonWest: lon,
        width: 23040,
        height: 15360,
        ppd: 512,
      });
    }
  }
  return out;
}

const GLOBAL_128: FileSpec = {
  url: `${SLDEM_BASE}/GLOBAL/FLOAT_IMG/SLDEM2015_128_60S_60N_000_360_FLOAT.IMG`,
  latMax: 60,
  lonWest: 0,
  width: 46080,
  height: 15360,
  ppd: 128,
};

async function fetchRange(url: string, offset: number, length: number): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== length) throw new Error(`short read ${buf.length}/${length}`);
      return buf;
    } catch (e) {
      if (attempt >= 5) throw new Error(`${url} @${offset}+${length}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      await fn(items[k]);
    }
  });
  await Promise.all(workers);
}

/** Read a window (lat range, lon range in degrees east, lon may be negative or
 *  exceed 360 to express wrapping) aligned to the product's pixel grid. */
export async function readSldemWindow(
  kind: "512" | "128",
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  tag: string,
): Promise<LatLonGrid> {
  const ppd = kind === "512" ? 512 : 128;
  // Align to the global pixel grid of this resolution.
  const latTop = Math.min(60, Math.ceil(latMax * ppd) / ppd);
  const latBot = Math.max(-60, Math.floor(latMin * ppd) / ppd);
  const lonWest = Math.floor(lonMin * ppd) / ppd;
  const lonEast = Math.ceil(lonMax * ppd) / ppd;
  const rows = Math.round((latTop - latBot) * ppd);
  const cols = Math.round((lonEast - lonWest) * ppd);

  const key = `sldem${kind}_${latTop.toFixed(4)}_${latBot.toFixed(4)}_${lonWest.toFixed(4)}_${lonEast.toFixed(4)}`;
  const dir = path.join(DEM_CACHE, "sldem");
  const binPath = path.join(dir, `${key}.f32`);
  const source = kind === "512" ? "SLDEM2015 512 ppd tiles" : "SLDEM2015 128 ppd global";
  if (existsSync(binPath)) {
    const buf = await readFile(binPath);
    const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
    log(`${tag}: ${source} window from cache (${rows}x${cols})`);
    return { ppd, latTop, lonWest, rows, cols, data, source };
  }

  const data = new Float32Array(rows * cols).fill(NaN);
  const specs = kind === "512" ? tileSpecs512() : [GLOBAL_128];
  interface Job { spec: FileSpec; fileRow: number; outRow: number; fileCol: number; outCol: number; n: number }
  const jobs: Job[] = [];
  for (let r = 0; r < rows; r++) {
    const latC = latTop - (r + 0.5) / ppd; // pixel-centre latitude
    // Longitude segments, splitting at file boundaries and the 0/360 seam.
    let c = 0;
    while (c < cols) {
      const lonC = lonWest + (c + 0.5) / ppd;
      const lon360 = ((lonC % 360) + 360) % 360;
      const spec = specs.find(
        (s) => latC <= s.latMax && latC > s.latMax - s.height / s.ppd && lon360 >= s.lonWest && lon360 < s.lonWest + s.width / s.ppd,
      );
      if (!spec) {
        c++;
        continue;
      }
      const fileRow = Math.floor((spec.latMax - latC) * ppd);
      const fileCol = Math.floor((lon360 - spec.lonWest) * ppd);
      const n = Math.min(cols - c, spec.width - fileCol);
      jobs.push({ spec, fileRow, outRow: r, fileCol, outCol: c, n });
      c += n;
    }
  }
  const t0 = Date.now();
  let bytes = 0;
  await pool(jobs, 24, async (j) => {
    const off = (j.fileRow * j.spec.width + j.fileCol) * 4;
    const buf = await fetchRange(j.spec.url, off, j.n * 4);
    bytes += buf.length;
    for (let k = 0; k < j.n; k++) {
      const v = buf.readFloatLE(k * 4);
      data[j.outRow * cols + j.outCol + k] = Number.isFinite(v) && Math.abs(v) < 30 ? v * 1000 : NaN;
    }
  });
  log(`${tag}: ${source} window ${rows}x${cols} fetched in ${((Date.now() - t0) / 1000).toFixed(0)} s (${(bytes / 1e6).toFixed(1)} MB, ${jobs.length} ranges)`);
  await mkdir(dir, { recursive: true });
  const out = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  await writeFile(binPath, out);
  await writeFile(
    binPath.replace(/\.f32$/, ".json"),
    JSON.stringify({ source, files: [...new Set(jobs.map((j) => j.spec.url))], ppd, latTop, lonWest, rows, cols, sha256: sha256(out) }),
  );
  return { ppd, latTop, lonWest, rows, cols, data, source };
}

/** Bilinear lat/lon sampler over a window grid (handles lon wrap relative
 *  to the window's west edge). Points outside -> ok=false. */
export function gridLayer(g: LatLonGrid, name: string, marginPx = 2): UnitLayer {
  const R2D = 180 / Math.PI;
  return {
    name,
    heightAtUnit(ux, uy, uz): HeightSample {
      const lat = Math.asin(Math.max(-1, Math.min(1, uz))) * R2D;
      let lon = Math.atan2(uy, ux) * R2D; // -180..180
      // Bring lon into [lonWest, lonWest+360).
      lon = g.lonWest + ((((lon - g.lonWest) % 360) + 360) % 360);
      const rowF = (g.latTop - lat) * g.ppd - 0.5;
      const colF = (lon - g.lonWest) * g.ppd - 0.5;
      if (rowF < marginPx || colF < marginPx || rowF > g.rows - 1 - marginPx || colF > g.cols - 1 - marginPx) {
        return { h: NaN, ok: false };
      }
      const r0 = Math.floor(rowF);
      const c0 = Math.floor(colF);
      const fy = rowF - r0;
      const fx = colF - c0;
      const i = r0 * g.cols + c0;
      const d = g.data;
      const h =
        d[i] * (1 - fx) * (1 - fy) + d[i + 1] * fx * (1 - fy) + d[i + g.cols] * (1 - fx) * fy + d[i + g.cols + 1] * fx * fy;
      return Number.isFinite(h) ? { h, ok: true } : { h: NaN, ok: false };
    },
  };
}

/** Window bounds (deg) for a +/- halfM metre box around a site. */
export function windowAround(latDeg: number, lonDeg: number, halfM: number) {
  const dLat = (halfM / 1_737_400) * (180 / Math.PI);
  const dLon = dLat / Math.max(0.2, Math.cos((latDeg * Math.PI) / 180));
  const lon360 = ((lonDeg % 360) + 360) % 360;
  return {
    latMin: latDeg - dLat,
    latMax: latDeg + dLat,
    lonMin: lon360 - dLon,
    lonMax: lon360 + dLon,
  };
}

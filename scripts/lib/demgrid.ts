/** DEM grids and bilinear samplers over the south-polar stereographic
 *  LOLA products. Georeference convention (verified against the IM-1
 *  LROC elevation, plan v1.1 C7): the ModelTiepoint maps raster (0,0)
 *  to the top-left corner of pixel (0,0); pixel centres are at
 *  x = X0 + (col+0.5)*sx, y = Y0 - (row+0.5)*sy. */

import { CogReader } from "./bigtiff";
import { R_MOON_M as R_M } from "../../src/lib/coords";

export interface HeightSample {
  h: number;
  ok: boolean;
}

export interface Sampler {
  /** Bilinear height (m) at stereographic (x,y) metres; ok=false if NaN/outside. */
  heightAt(x: number, y: number): HeightSample;
  name: string;
}

/** Fully-decoded in-memory grid (for the 80 m and 240 m files). */
export async function loadFullGrid(reader: CogReader, name: string): Promise<Sampler> {
  const { width, height, tileWidth, tileHeight, tilesAcross, tilesDown, pixelScale, tiepoint } = reader.info;
  const grid = new Float32Array(width * height);
  for (let ty = 0; ty < tilesDown; ty++) {
    for (let tx = 0; tx < tilesAcross; tx++) {
      const tdata = (await reader.tile(ty * tilesAcross + tx)) as Float32Array;
      const h = Math.min(tileHeight, height - ty * tileHeight);
      const w = Math.min(tileWidth, width - tx * tileWidth);
      for (let r = 0; r < h; r++) {
        grid.set(
          tdata.subarray(r * tileWidth, r * tileWidth + w),
          (ty * tileHeight + r) * width + tx * tileWidth,
        );
      }
    }
  }
  return gridSampler(grid, width, height, pixelScale[0], tiepoint[0], tiepoint[1], name);
}

/** Fully-decoded grid as a raw Float32Array in a SharedArrayBuffer (so
 *  worker threads can read it without copying) plus its georeference. */
export async function loadRawGridShared(
  reader: CogReader,
): Promise<{ data: Float32Array; width: number; height: number; px: number; X0: number; Y0: number }> {
  const { width, height, tileWidth, tileHeight, tilesAcross, tilesDown, pixelScale, tiepoint } = reader.info;
  const data = new Float32Array(new SharedArrayBuffer(width * height * 4));
  for (let ty = 0; ty < tilesDown; ty++) {
    for (let tx = 0; tx < tilesAcross; tx++) {
      const tdata = (await reader.tile(ty * tilesAcross + tx)) as Float32Array;
      const h = Math.min(tileHeight, height - ty * tileHeight);
      const w = Math.min(tileWidth, width - tx * tileWidth);
      for (let r = 0; r < h; r++) {
        data.set(tdata.subarray(r * tileWidth, r * tileWidth + w), (ty * tileHeight + r) * width + tx * tileWidth);
      }
    }
  }
  return { data, width, height, px: pixelScale[0], X0: tiepoint[0], Y0: tiepoint[1] };
}

/** Lazy sampler backed by the reader's tile cache (for remote 20 m windows).
 *  Tiles must have been prefetched (or a rawTileProvider supplied) before
 *  calling heightAt, which is synchronous by design. */
export function lazySampler(reader: CogReader, decoded: Map<number, Float32Array>, name: string): Sampler {
  const { width, height, tileWidth, tileHeight, tilesAcross, pixelScale, tiepoint } = reader.info;
  const px = pixelScale[0];
  const X0 = tiepoint[0];
  const Y0 = tiepoint[1];
  const val = (col: number, row: number): number => {
    if (col < 0 || row < 0 || col >= width || row >= height) return NaN;
    const t = decoded.get(Math.floor(row / tileHeight) * tilesAcross + Math.floor(col / tileWidth));
    if (!t) return NaN;
    return t[(row % tileHeight) * tileWidth + (col % tileWidth)];
  };
  return bilinearOver(val, px, X0, Y0, name);
}

function gridSampler(
  grid: Float32Array,
  width: number,
  height: number,
  px: number,
  X0: number,
  Y0: number,
  name: string,
): Sampler {
  const val = (col: number, row: number): number =>
    col < 0 || row < 0 || col >= width || row >= height ? NaN : grid[row * width + col];
  return bilinearOver(val, px, X0, Y0, name);
}

function bilinearOver(
  val: (col: number, row: number) => number,
  px: number,
  X0: number,
  Y0: number,
  name: string,
): Sampler {
  return {
    name,
    heightAt(x: number, y: number): HeightSample {
      const colF = (x - X0) / px - 0.5;
      const rowF = (Y0 - y) / px - 0.5;
      const c0 = Math.floor(colF);
      const r0 = Math.floor(rowF);
      const fx = colF - c0;
      const fy = rowF - r0;
      const v00 = val(c0, r0);
      const v10 = val(c0 + 1, r0);
      const v01 = val(c0, r0 + 1);
      const v11 = val(c0 + 1, r0 + 1);
      const h =
        v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
      return Number.isFinite(h) ? { h, ok: true } : { h: NaN, ok: false };
    },
  };
}

/** Layered sampler: first matching layer wins; NaN falls through. */
export function mosaic(
  layers: { sampler: Sampler; contains: (x: number, y: number) => boolean }[],
): Sampler & { misses: () => number } {
  let misses = 0;
  return {
    name: "mosaic(" + layers.map((l) => l.sampler.name).join(",") + ")",
    heightAt(x: number, y: number): HeightSample {
      for (const l of layers) {
        if (!l.contains(x, y)) continue;
        const s = l.sampler.heightAt(x, y);
        if (s.ok) return s;
      }
      misses++;
      return { h: NaN, ok: false };
    },
    misses: () => misses,
  };
}

/* ------------------------------------------------------------------------
 * Unit-vector samplers. The horizon marcher works on unit vectors in the
 * lunar body-fixed frame (MOON_ME); each DEM family converts to its own grid
 * coordinates. Polar products: south polar stereographic. SLDEM2015: simple
 * cylindrical lat/lon.
 * ---------------------------------------------------------------------- */


export interface UnitSampler {
  name: string;
  heightAtUnit(ux: number, uy: number, uz: number): HeightSample;
  misses(): number;
}

export interface UnitLayer {
  name: string;
  /** Returns a height, or ok=false to fall through to the next layer. */
  heightAtUnit(ux: number, uy: number, uz: number): HeightSample;
}

/** Adapter: a stereographic (x,y) sampler restricted to a box -> unit layer. */
export function polarLayer(sampler: Sampler, contains: (x: number, y: number) => boolean): UnitLayer {
  return {
    name: sampler.name,
    heightAtUnit(ux, uy, uz) {
      // South polar stereographic directly from the unit vector:
      // x = 2R*uy/(1-uz), y = 2R*ux/(1-uz) (equivalent to rho*sin/cos lon).
      const w = (2 * R_M) / (1 - uz);
      const x = w * uy;
      const y = w * ux;
      if (!contains(x, y)) return { h: NaN, ok: false };
      return sampler.heightAt(x, y);
    },
  };
}

/** First layer that yields a finite height wins; remaining misses counted. */
export function unitMosaic(layers: UnitLayer[]): UnitSampler {
  let misses = 0;
  return {
    name: "mosaic(" + layers.map((l) => l.name).join(",") + ")",
    heightAtUnit(ux, uy, uz) {
      for (const l of layers) {
        const s = l.heightAtUnit(ux, uy, uz);
        if (s.ok) return s;
      }
      misses++;
      return { h: NaN, ok: false };
    },
    misses: () => misses,
  };
}

/** Loader for the south-polar Level B-grid (public/data/polar). Files are
 *  gzip-compressed at build time; they are decompressed here with the
 *  browser's DecompressionStream. If a server already removed the gzip layer
 *  (Content-Encoding), the bytes are used as they are (magic-number check). */

import {
  POLAR_AZ_BINS, chunkFile, chunkOf, nearestNode, nodeLatLon, nodeStats, offsetInChunk, parseStats, toHorizonMask,
  type PolarNodeStats, type PolarStats,
} from "../science/polarGrid";
import type { HorizonMask } from "../../types";

export interface PolarMeta {
  spacingM: number;
  halfM: number;
  n: number;
  nodes: number;
  timeWindow: { startUtc: string; stepS: number; samples: number };
  method: string;
  sourceIds: string[];
  generated: string;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf; // already decoded by the server
  const ds = new DecompressionStream("gzip");
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

let metaP: Promise<PolarMeta> | null = null;
let statsP: Promise<PolarStats> | null = null;
const chunks = new Map<string, Promise<Uint8Array>>();

export function loadPolarMeta(): Promise<PolarMeta> {
  if (!metaP) metaP = fetch("/data/polar/meta.json").then((r) => {
    if (!r.ok) throw new Error(`polar meta: HTTP ${r.status}`);
    return r.json() as Promise<PolarMeta>;
  });
  metaP.catch(() => (metaP = null));
  return metaP;
}

export function loadPolarStats(): Promise<PolarStats> {
  if (!statsP) statsP = fetchBytes("/data/polar/stats.bin.gz").then((b) => parseStats(b));
  statsP.catch(() => (statsP = null));
  return statsP;
}

function loadChunk(ci: number, cj: number): Promise<Uint8Array> {
  const f = chunkFile(ci, cj);
  let p = chunks.get(f);
  if (!p) {
    p = fetchBytes(`/data/polar/${f}`).then((b) => new Uint8Array(b));
    p.catch(() => chunks.delete(f));
    chunks.set(f, p);
  }
  return p;
}

export interface PolarPoint {
  /** Requested coordinate. */
  latDeg: number;
  lonDeg: number;
  node: { i: number; j: number; idx: number; latDeg: number; lonDeg: number; distM: number };
  stats: PolarNodeStats;
  mask: HorizonMask;
}

/** Terrain data for the grid node nearest a coordinate; null outside the grid
 *  or where the DEM has no value. */
export async function loadPolarPoint(latDeg: number, lonDeg: number): Promise<PolarPoint | null> {
  const nn = nearestNode(latDeg, lonDeg);
  if (!nn) return null;
  const [stats, chunk] = await Promise.all([loadPolarStats(), (() => {
    const { ci, cj } = chunkOf(nn.i, nn.j);
    return loadChunk(ci, cj);
  })()]);
  const s = nodeStats(stats, nn.idx);
  if (s.demHeightM === -32768) return null;
  const { ci, li, lj } = chunkOf(nn.i, nn.j);
  const off = offsetInChunk(ci, li, lj);
  const bytes = chunk.subarray(off, off + POLAR_AZ_BINS);
  const ll = nodeLatLon(nn.i, nn.j);
  return {
    latDeg,
    lonDeg,
    node: { ...nn, ...ll },
    stats: s,
    mask: toHorizonMask(bytes, nn, s.demHeightM),
  };
}

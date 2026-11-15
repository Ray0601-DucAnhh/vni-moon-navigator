/** South-polar Level B-grid: geometry, encoding, and the shipped data files
 *  (public/data/polar). Heavy recomputation lives in npm run
 *  data:polar:validate (PG-1..PG-6); these tests guard the contracts the app
 *  relies on. */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import {
  POLAR_AZ_BINS, POLAR_CHUNK, POLAR_CHUNKS, POLAR_N, POLAR_NODES, POLAR_RADIUS_M, chunkFile, chunkOf, chunkSize,
  decodeEl, encodeEl, maskElAt, nearestNode, nodeIndex, nodeLatLon, nodeStats, nodeXY, offsetInChunk, parseStats,
  statsLayout, toHorizonMask,
} from "../src/services/science/polarGrid";
import { southStereo } from "../src/lib/coords";

const D = path.resolve(__dirname, "..", "public", "data", "polar");
const gz = (p: string) => {
  const b = gunzipSync(readFileSync(path.join(D, p)));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe("polar grid geometry", () => {
  it("has 301 x 301 nodes at 2 km and the pole at the centre node", () => {
    expect(POLAR_N).toBe(301);
    expect(nodeXY(150, 150)).toEqual({ x: 0, y: 0 });
    expect(nodeLatLon(150, 150).latDeg).toBe(-90);
  });

  it("nearestNode inverts nodeLatLon for nodes inside the disc", () => {
    for (const [i, j] of [[150, 151], [10, 150], [200, 37], [151, 290], [80, 80]]) {
      const ll = nodeLatLon(i, j);
      const n = nearestNode(ll.latDeg, ll.lonDeg);
      expect(n).not.toBeNull();
      expect([n!.i, n!.j]).toEqual([i, j]);
      expect(n!.distM).toBeLessThan(1e-3);
      expect(n!.idx).toBe(nodeIndex(i, j));
    }
  });

  it("rejects points outside the 300 km disc (and the square's corners)", () => {
    expect(nearestNode(-79.5, 0)).toBeNull();
    expect(nearestNode(-45, 10)).toBeNull();
    const corner = nodeLatLon(0, 0); // rho = 424 km
    expect(nearestNode(corner.latDeg, corner.lonDeg)).toBeNull();
    const { x, y } = southStereo(-80.2, 37);
    expect(Math.hypot(x, y)).toBeLessThan(POLAR_RADIUS_M);
    expect(nearestNode(-80.2, 37)).not.toBeNull();
  });

  it("reports the real distance to the node (within 1%)", () => {
    const ll = nodeLatLon(150, 140); // 20 km from the pole along a grid line
    const n = nearestNode(ll.latDeg + 0.009, ll.lonDeg)!; // ~0.27 km further north
    expect(n.distM).toBeGreaterThan(200);
    expect(n.distM).toBeLessThan(350);
  });

  it("chunks tile the grid exactly once", () => {
    let total = 0;
    for (let c = 0; c < POLAR_CHUNKS; c++) total += chunkSize(c);
    expect(total).toBe(POLAR_N);
    const { ci, cj, li, lj } = chunkOf(300, 155);
    expect([ci, cj, li, lj]).toEqual([9, 5, 300 - 9 * POLAR_CHUNK, 155 - 5 * POLAR_CHUNK]);
    expect(offsetInChunk(9, li, lj)).toBe((lj * chunkSize(9) + li) * POLAR_AZ_BINS);
  });
});

describe("mask encoding", () => {
  it("round-trips to 0.05 deg inside -5..20.5 and clamps outside", () => {
    for (const v of [-5, -1.234, 0, 0.05, 3.96, 12.3, 20.5]) expect(Math.abs(decodeEl(encodeEl(v)) - v)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(decodeEl(encodeEl(33))).toBe(20.5);
    expect(decodeEl(encodeEl(-9))).toBe(-5);
  });

  it("interpolates between 1-degree bins and wraps at 360", () => {
    const b = new Uint8Array(360).fill(50);
    b[359] = 70;
    b[0] = 90;
    expect(maskElAt(b, 359.5)).toBeCloseTo(decodeEl(80), 9);
    expect(maskElAt(b, -0.5)).toBeCloseTo(decodeEl(80), 9);
    expect(maskElAt(b, 0)).toBeCloseTo(decodeEl(90), 9);
  });

  it("expands to a 3600-bin HorizonMask that agrees with the byte mask", () => {
    const b = Uint8Array.from({ length: 360 }, (_, k) => (k * 7) % 256);
    const m = toHorizonMask(b, { i: 1, j: 2 }, -1234);
    expect(m.horizonElDeg).toHaveLength(3600);
    expect(m.azStepDeg).toBe(0.1);
    expect(m.horizonElDeg[1234]).toBeCloseTo(maskElAt(b, 123.4), 9);
    expect(m.demHeightM).toBe(-1234);
  });
});

describe("shipped polar data", () => {
  it("meta.json matches the code constants", () => {
    const meta = JSON.parse(readFileSync(path.join(D, "meta.json"), "utf8"));
    expect(meta.n).toBe(POLAR_N);
    expect(meta.nodes).toBe(POLAR_NODES);
    expect(meta.azBins).toBe(POLAR_AZ_BINS);
    expect(meta.chunk).toBe(POLAR_CHUNK);
    expect(meta.timeWindow.startUtc).toBe("2026-11-01T00:00:00Z");
    expect(meta.checks.nodesWithoutDem).toBe(0);
    expect(meta.checks.maxSunElDeg).toBeLessThan(20.5);
    expect(meta.checks.maxEarthElDeg).toBeLessThan(20.5);
    expect(meta.sourceIds).toEqual(expect.arrayContaining(["S34", "S50"]));
  });

  it("stats.bin has the documented layout and plausible values", () => {
    const buf = gz("stats.bin.gz");
    expect(buf.byteLength).toBe(statsLayout(POLAR_NODES).bytes);
    const s = parseStats(buf);
    let maxSun = 0;
    for (let k = 0; k < s.n; k++) {
      expect(s.sun[k]).toBeLessThanOrEqual(200);
      expect(s.both[k]).toBeLessThanOrEqual(Math.min(s.sun[k], s.earth[k]) + 1);
      if (s.sun[k] > maxSun) maxSun = s.sun[k];
    }
    expect(maxSun / 2).toBeLessThan(80); // map colour scale stops at 80% for Sun
    // Cabeus crater floor (IAU 953) is permanently shadowed: 0% Sun, dark all year.
    const n = nearestNode(-85.33, -42.13)!;
    const ns = nodeStats(s, n.idx);
    expect(ns.sunlitFrac).toBe(0);
    expect(ns.longestDarkH).toBe(8761);
  });

  it("all 100 mask chunks exist with the right size", () => {
    for (let cj = 0; cj < POLAR_CHUNKS; cj++) {
      for (let ci = 0; ci < POLAR_CHUNKS; ci++) {
        const f = chunkFile(ci, cj);
        expect(existsSync(path.join(D, f)), f).toBe(true);
      }
    }
    expect(gz(chunkFile(9, 9)).byteLength).toBe(chunkSize(9) * chunkSize(9) * POLAR_AZ_BINS);
    expect(gz(chunkFile(0, 4)).byteLength).toBe(chunkSize(0) * chunkSize(4) * POLAR_AZ_BINS);
  });
});

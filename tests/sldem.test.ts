/** SLDEM2015 lat/lon grid sampler: georeferencing, bilinear interpolation,
 *  longitude wrap and window bounds (synthetic grids, no network). */

import { describe, expect, it } from "vitest";
import { gridLayer, windowAround, type LatLonGrid } from "../scripts/lib/sldem";
import { latLonToUnit } from "../src/lib/coords";

/** Grid whose value at each pixel centre is a known linear function of
 *  lat/lon, so bilinear interpolation must reproduce it exactly. */
function linearGrid(latTop: number, lonWest: number, rows: number, cols: number, ppd: number): LatLonGrid {
  const data = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat = latTop - (r + 0.5) / ppd;
      const lon = lonWest + (c + 0.5) / ppd;
      data[r * cols + c] = 1000 * lat + 10 * lon;
    }
  }
  return { ppd, latTop, lonWest, rows, cols, data, source: "synthetic" };
}

const at = (layer: ReturnType<typeof gridLayer>, lat: number, lon: number) => {
  const u = latLonToUnit(lat, lon);
  return layer.heightAtUnit(u.x, u.y, u.z);
};

describe("SLDEM grid layer", () => {
  it("reproduces a linear field at arbitrary points (georeferencing + bilinear)", () => {
    const g = linearGrid(2, 20, 512, 512, 128); // lat 2..-2, lon 20..24
    const layer = gridLayer(g, "t");
    for (const [lat, lon] of [[0.6742, 23.4731], [1.1, 21.03], [-1.5, 22.9]]) {
      const s = at(layer, lat, lon);
      expect(s.ok).toBe(true);
      expect(s.h).toBeCloseTo(1000 * lat + 10 * lon, 2);
    }
  });

  it("handles windows that straddle the 0/360 longitude seam", () => {
    const g = linearGrid(27, -3.5, 256, 1024, 128); // 356.5E..4.5E as lonWest = -3.5
    const layer = gridLayer(g, "t");
    const s1 = at(layer, 26.13, 3.633); // Apollo 15-like longitude, east of the seam
    const s2 = at(layer, 26.0, -2.0); // west of the seam (358 E)
    expect(s1.ok && s2.ok).toBe(true);
    expect(s1.h).toBeCloseTo(1000 * 26.13 + 10 * 3.633, 1);
    expect(s2.h).toBeCloseTo(1000 * 26.0 + 10 * -2.0, 1);
  });

  it("returns ok=false outside the window", () => {
    const g = linearGrid(2, 20, 512, 512, 128);
    const layer = gridLayer(g, "t");
    expect(at(layer, 10, 22).ok).toBe(false);
    expect(at(layer, 0, 30).ok).toBe(false);
  });

  it("window bounds widen in longitude with latitude", () => {
    const eq = windowAround(0, 10, 25_000);
    const hi = windowAround(45, 10, 25_000);
    expect(eq.latMax - eq.latMin).toBeCloseTo(hi.latMax - hi.latMin, 9);
    expect(hi.lonMax - hi.lonMin).toBeGreaterThan(1.39 * (eq.lonMax - eq.lonMin));
  });
});

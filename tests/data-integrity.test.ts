/** Data integrity over the committed runtime data for EVERY site: files
 *  present, shapes, coordinate conventions, sources resolvable, terrain
 *  provenance recorded, and region-only entries never given coordinates. */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { HorizonMask, Site, SiteDerived, SiteEphemeris } from "../src/types";

const D = path.resolve(__dirname, "..", "public", "data");
const read = <T,>(p: string): T => JSON.parse(readFileSync(path.join(D, p), "utf8")) as T;

const { sites } = read<{ sites: Site[] }>("sites.json");
const { sources } = read<{ sources: { id: string }[] }>("sources.json");
const { regions } = read<{ regions: Record<string, unknown>[] }>("regions.json");
const sourceIds = new Set(sources.map((s) => s.id));

describe("site catalogue", () => {
  it("has 14 coordinate-verified sites, all analysed", () => {
    expect(sites.length).toBe(14);
    expect(sites.every((s) => s.analysed)).toBe(true);
  });

  it("uses planetocentric lat/lon conventions", () => {
    for (const s of sites) {
      expect(s.latDeg).toBeGreaterThanOrEqual(-90);
      expect(s.latDeg).toBeLessThanOrEqual(90);
      expect(s.lonDeg).toBeGreaterThan(-180);
      expect(s.lonDeg).toBeLessThanOrEqual(180);
    }
  });

  it("cites only sources that exist in the registry, including terrain + ephemeris sources", () => {
    for (const s of sites) {
      for (const id of s.sourceIds) expect(sourceIds.has(id), `${s.id} cites ${id}`).toBe(true);
      expect(s.sourceIds.includes("S50"), `${s.id} cites Horizons`).toBe(true);
      expect(s.sourceIds.includes(s.latDeg <= -60 ? "S34" : "S33"), `${s.id} cites its DEM`).toBe(true);
    }
  });

  it("region-only entries carry no coordinates", () => {
    for (const r of regions) {
      expect(r).not.toHaveProperty("latDeg");
      expect(r).not.toHaveProperty("lonDeg");
    }
  });
});

describe.each(sites.map((s) => [s.id, s] as const))("site %s data files", (id, site) => {
  it("ephemeris: full window, 30-min grid, plausible ranges", () => {
    expect(existsSync(path.join(D, "ephemeris", `${id}.json`))).toBe(true);
    const e = read<SiteEphemeris>(`ephemeris/${id}.json`);
    expect(e.startUtc).toBe("2026-11-01T00:00:00Z");
    expect(e.stepS).toBe(1800);
    expect(e.count).toBe(17521);
    for (const arr of [e.sunAz, e.sunEl, e.earthAz, e.earthEl]) expect(arr.length).toBe(e.count);
    expect(Math.max(...e.sunEl)).toBeLessThanOrEqual(90);
    expect(Math.min(...e.sunAz)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...e.sunAz)).toBeLessThan(360);
  });

  it("horizon mask: 3600 bins, no DEM gaps, provenance recorded", () => {
    const m = read<HorizonMask>(`horizon/${id}.json`);
    expect(m.horizonElDeg.length).toBe(3600);
    expect(m.horizonDistKm.length).toBe(3600);
    expect(m.nanSamples).toBe(0);
    expect(m.observerHeightM).toBe(2);
    expect(m.maxRangeKm).toBe(300);
    expect(m.demFiles.length).toBeGreaterThan(0);
    expect(m.terrainFamily).toBe(site.latDeg <= -79.9 ? "polar80" : site.latDeg <= -60 ? "polar60" : "sldem");
    expect(typeof m.resolutionNote).toBe("string");
    // Horizon never below the smooth-sphere dip by more than the terrain relief allows.
    expect(Math.min(...m.horizonElDeg)).toBeGreaterThan(-6);
    expect(Math.max(...m.horizonElDeg)).toBeLessThan(45);
  });

  it("derived: ordered alternating events, 365 daily rows", () => {
    const d = read<SiteDerived>(`derived/${id}.json`);
    expect(d.dailyDates.length).toBe(365);
    for (const evs of [d.sunEvents, d.earthEvents]) {
      for (let i = 1; i < evs.length; i++) {
        expect(Date.parse(evs[i].utc)).toBeGreaterThan(Date.parse(evs[i - 1].utc));
        expect(evs[i].type).not.toBe(evs[i - 1].type);
      }
    }
  });
});

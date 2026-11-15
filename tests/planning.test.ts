import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeEphAccessor, windowStats } from "../src/services/science/core";
import { findOperationWindows, totalHours } from "../src/services/science/planning";
import type { HorizonMask, SiteDerived, SiteEphemeris } from "../src/types";

const D = path.resolve(__dirname, "..", "public", "data");
const load = (id: string) => ({
  acc: makeEphAccessor(JSON.parse(readFileSync(path.join(D, "ephemeris", `${id}.json`), "utf8")) as SiteEphemeris),
  mask: JSON.parse(readFileSync(path.join(D, "horizon", `${id}.json`), "utf8")) as HorizonMask,
  derived: JSON.parse(readFileSync(path.join(D, "derived", `${id}.json`), "utf8")) as SiteDerived,
});

describe("operation windows (temporal feasibility)", () => {
  for (const id of ["im2", "im1", "a17"]) {
    const { acc, mask, derived } = load(id);

    it(`${id}: Sun-only windows reproduce the shipped sunrise/sunset events exactly`, () => {
      const ws = findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: true, needEarth: false, minDurationH: 0 });
      const starts = ws.filter((w) => !w.startClipped).map((w) => w.startUtc.slice(0, 16));
      const ends = ws.filter((w) => !w.endClipped).map((w) => w.endUtc.slice(0, 16));
      const rises = derived.sunEvents.filter((e) => e.type === "rise").map((e) => e.utc.slice(0, 16));
      const sets = derived.sunEvents.filter((e) => e.type === "set").map((e) => e.utc.slice(0, 16));
      expect(starts).toEqual(rises);
      expect(ends).toEqual(sets);
    });

    it(`${id}: total Sun-only hours match the 10-minute sunlit fraction (< 0.5%)`, () => {
      const ws = findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: true, needEarth: false, minDurationH: 0 });
      const spanH = (acc.endMs - acc.startMs) / 3_600_000;
      const st = windowStats(acc, mask, acc.startMs, 366);
      expect(Math.abs(totalHours(ws) / spanH - st.sunlitFrac)).toBeLessThan(0.005);
    });
  }

  it("Sun + Earth windows lie inside Sun-only windows and respect the minimum duration", () => {
    const { acc, mask } = load("im2");
    const sunOnly = findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: true, needEarth: false, minDurationH: 0 });
    const both = findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: true, needEarth: true, minDurationH: 48 });
    expect(both.length).toBeGreaterThan(0);
    for (const w of both) {
      expect(w.durationH).toBeGreaterThanOrEqual(48);
      const inside = sunOnly.some((s) => s.startUtc <= w.startUtc && w.endUtc <= s.endUtc);
      expect(inside).toBe(true);
    }
  });

  it("a far-side site has no window when Earth is required", () => {
    const { acc, mask } = load("ce4");
    expect(findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: true, needEarth: true, minDurationH: 1 })).toEqual([]);
  });

  it("a higher clearance requirement never adds hours", () => {
    const { acc, mask } = load("a17");
    const c0 = totalHours(findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: true, needEarth: false, minDurationH: 0 }));
    const c5 = totalHours(findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: true, needEarth: false, minSunClearanceDeg: 5, minDurationH: 0 }));
    expect(c5).toBeLessThan(c0);
  });

  it("no conditions -> no windows", () => {
    const { acc, mask } = load("a17");
    expect(findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: false, needEarth: false, minDurationH: 0 })).toEqual([]);
  });
});

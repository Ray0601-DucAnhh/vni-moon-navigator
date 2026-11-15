import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeEphAccessor } from "../src/services/science/core";
import { makeCustomPoint, skyAt } from "../src/services/science/customPoint";
import { findOperationWindows } from "../src/services/science/planning";
import type { HorizonMask, MoonGeocentric, Site, SiteEphemeris } from "../src/types";

const D = path.resolve(__dirname, "..", "public", "data");
const J = <T,>(p: string) => JSON.parse(readFileSync(path.join(D, p), "utf8")) as T;
const geo = J<MoonGeocentric>("ephemeris/moon-geocentric.json");
const { sites } = J<{ sites: Site[] }>("sites.json");

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe("SV-6: Level A sky formula vs JPL Horizons topocentric series", () => {
  let worstSun = 0;
  let worstEarth = 0;
  let worstSunAz = 0;
  for (const s of sites) {
    it(`${s.id}: Sun and Earth elevation match Horizons`, () => {
      const acc = makeEphAccessor(J<SiteEphemeris>(`ephemeris/${s.id}.json`));
      const h = J<HorizonMask>(`horizon/${s.id}.json`).demHeightM / 1000;
      let ws = 0, we = 0, wa = 0;
      for (let t = acc.startMs; t <= acc.endMs; t += 4 * 86_400_000 + 3_600_000) {
        const p = skyAt(geo, s.latDeg, s.lonDeg, h, t);
        const sun = acc.sun(t);
        const earth = acc.earth(t);
        ws = Math.max(ws, Math.abs(p.sun.elDeg - sun.elDeg));
        we = Math.max(we, Math.abs(p.earth.elDeg - earth.elDeg));
        if (sun.elDeg > -60 && sun.elDeg < 80) wa = Math.max(wa, angDiff(p.sun.azDeg, sun.azDeg));
      }
      worstSun = Math.max(worstSun, ws);
      worstEarth = Math.max(worstEarth, we);
      worstSunAz = Math.max(worstSunAz, wa);
      expect(ws).toBeLessThan(0.05);
      expect(we).toBeLessThan(0.1);
      expect(wa).toBeLessThan(0.2);
    });
  }
  it("reports the worst differences", () => {
    console.log(`SV-6 worst |diff|: Sun el ${worstSun.toFixed(4)} deg, Earth el ${worstEarth.toFixed(4)} deg, Sun az ${worstSunAz.toFixed(4)} deg`);
    expect(worstSun).toBeGreaterThanOrEqual(0);
  });
});

describe("custom point (Level A)", () => {
  it("works with the existing window finder", () => {
    const { acc, mask } = makeCustomPoint(geo, 20.19, 30.77);
    const ws = findOperationWindows(acc, mask, acc.startMs, acc.endMs, { needSun: true, needEarth: true, minDurationH: 48 });
    expect(ws.length).toBeGreaterThan(10);
  });
});

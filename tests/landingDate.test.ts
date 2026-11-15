import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeEphAccessor } from "../src/services/science/core";
import { landingDateSensitivity } from "../src/services/science/planning";
import type { HorizonMask, SiteEphemeris } from "../src/types";

const D = path.resolve(__dirname, "..", "public", "data");
const acc = makeEphAccessor(JSON.parse(readFileSync(path.join(D, "ephemeris", "im2.json"), "utf8")) as SiteEphemeris);
const mask = JSON.parse(readFileSync(path.join(D, "horizon", "im2.json"), "utf8")) as HorizonMask;
const c = { needSun: true, needEarth: true, minDurationH: 0 };

describe("landing-date sensitivity", () => {
  const mid = landingDateSensitivity(acc, mask, c);
  it("one value per landing day, each within 0..14 days of hours", () => {
    expect(mid.length).toBeGreaterThan(340);
    for (const p of mid) expect(p.usableH).toBeGreaterThanOrEqual(0), expect(p.usableH).toBeLessThanOrEqual(14 * 24 + 1e-6);
  });
  it("raising the horizon never adds hours; lowering never removes them", () => {
    const up = landingDateSensitivity(acc, mask, { ...c, horizonOffsetDeg: 0.2 });
    const down = landingDateSensitivity(acc, mask, { ...c, horizonOffsetDeg: -0.2 });
    for (let i = 0; i < mid.length; i++) {
      expect(up[i].usableH).toBeLessThanOrEqual(mid[i].usableH + 0.2);
      expect(down[i].usableH).toBeGreaterThanOrEqual(mid[i].usableH - 0.2);
    }
  });
});

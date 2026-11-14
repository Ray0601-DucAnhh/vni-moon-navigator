/** Unit tests for the science core and the terrain marcher (TV-2, TV-3, plus
 *  interpolation and sun-disc checks). Synthetic DEM samplers are injected,
 *  so no network or DEM cache is needed. */

import { describe, expect, it } from "vitest";
import {
  SUN_ANGULAR_RADIUS_DEG, findCrossings, horizonElAt, lerpAzDeg,
  makeEphAccessor, sunVisibleFraction, windowStats,
} from "../src/services/science/core";
import { R_MOON_M, destination, latLonToUnit, smoothDipDeg, southStereoInverse, southStereo } from "../src/lib/coords";
import { buildMask } from "../scripts/terrain/build-horizon-masks";
import type { HorizonMask, SiteEphemeris } from "../src/types";

function syntheticSampler(hOf: (latDeg: number, lonDeg: number) => number) {
  let misses = 0;
  return {
    name: "synthetic",
    heightAt(x: number, y: number) {
      const ll = southStereoInverse(x, y);
      return { h: hOf(ll.latDeg, ll.lonDeg), ok: true };
    },
    misses: () => misses,
  };
}

const target = { id: "t", latDeg: -85, lonDeg: 0, toPublic: false };

describe("TV-2: flat synthetic DEM", () => {
  it("horizon equals the smooth-sphere dip at every azimuth", () => {
    const sampler = syntheticSampler(() => 500);
    const { mask } = buildMask(target, sampler, 500, 50_000, [], null, 10);
    const expected = smoothDipDeg(500, 2); // ~ -0.0869 deg
    const els = mask.horizonElDeg as number[];
    for (let k = 0; k < els.length; k += 3) {
      expect(Math.abs(els[k] - expected)).toBeLessThan(0.002);
    }
  });
});

describe("TV-3: synthetic Gaussian mountain", () => {
  // Terrain is a function of great-circle distance from a peak placed 10 km
  // due north of the target: h = 500 + 1500*exp(-(dPeak^2)/(2*800^2)).
  const peak = destination(target.latDeg, target.lonDeg, 0, 10_000);
  const uPeak = latLonToUnit(peak.latDeg, peak.lonDeg);
  const hOf = (lat: number, lon: number): number => {
    const u = latLonToUnit(lat, lon);
    const dot = Math.min(1, u.x * uPeak.x + u.y * uPeak.y + u.z * uPeak.z);
    const d = Math.acos(dot) * R_MOON_M;
    return 500 + 1500 * Math.exp(-(d * d) / (2 * 800 * 800));
  };

  it("matches an independent 1-D chord-formula scan along the peak azimuth", () => {
    const sampler = syntheticSampler(hOf);
    const { mask } = buildMask(target, sampler, hOf(target.latDeg, target.lonDeg), 50_000, [], null, 10);
    // Independent expectation: direct scalar scan at 1 m steps, chord formula.
    const h0 = hOf(target.latDeg, target.lonDeg) + 2;
    const rO = R_MOON_M + h0;
    let best = -90;
    for (let d = 1; d <= 30_000; d += 1) {
      const sigma = d / R_MOON_M;
      // distance from the ray point to the peak centre along the surface
      const dPeak = Math.abs(10_000 - d);
      const h = 500 + 1500 * Math.exp(-(dPeak * dPeak) / (2 * 800 * 800));
      const rP = R_MOON_M + h;
      const chord = Math.sqrt(rP * rP + rO * rO - 2 * rP * rO * Math.cos(sigma));
      const el = (Math.asin((rP * Math.cos(sigma) - rO) / chord) * 180) / Math.PI;
      if (el > best) best = el;
    }
    const els = mask.horizonElDeg as number[];
    expect(Math.abs(els[0] - best)).toBeLessThan(0.02); // az bin 0 = north
    // Peak elevation sanity: ~atan(1500/10000) minus curvature, i.e. a few deg.
    expect(els[0]).toBeGreaterThan(5);
    expect(els[0]).toBeLessThan(9);
    // Away from the mountain the horizon returns to the flat dip.
    expect(Math.abs(els[18] - smoothDipDeg(500, 2))).toBeLessThan(0.01);
  });
});

describe("science core", () => {
  it("azimuth interpolation takes the shorter arc across 0/360", () => {
    expect(lerpAzDeg(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(lerpAzDeg(10, 350, 0.25)).toBeCloseTo(5, 6);
    expect(lerpAzDeg(90, 180, 0.5)).toBeCloseTo(135, 6);
  });

  it("sun visible fraction: 0 below, 0.5 at centre, 1 above", () => {
    expect(sunVisibleFraction(-1, 0)).toBe(0);
    expect(sunVisibleFraction(0, 0)).toBeCloseTo(0.5, 9);
    expect(sunVisibleFraction(1, 0)).toBe(1);
    const r = SUN_ANGULAR_RADIUS_DEG;
    expect(sunVisibleFraction(r / 2, 0)).toBeGreaterThan(0.5);
    expect(SUN_ANGULAR_RADIUS_DEG).toBeCloseTo(0.2665, 3);
  });

  it("horizon lookup interpolates and wraps", () => {
    const mask = {
      azStepDeg: 0.1,
      horizonElDeg: Array.from({ length: 3600 }, (_, k) => (k === 0 ? 2 : k === 3599 ? 1 : 0)),
      horizonDistKm: new Array(3600).fill(10),
    } as unknown as HorizonMask;
    expect(horizonElAt(mask, 0)).toBeCloseTo(2, 9);
    expect(horizonElAt(mask, 359.95)).toBeCloseTo(1.5, 9); // halfway 3599 -> 0
    expect(horizonElAt(mask, 180)).toBeCloseTo(0, 9);
  });

  it("findCrossings locates a synthetic rise/set pair to the minute", () => {
    const t0 = Date.UTC(2027, 0, 1);
    const period = 86_400_000;
    const f = (t: number) => Math.sin(((t - t0) / period) * 2 * Math.PI); // rise at t0(+), set at t0+12h
    const ev = findCrossings(f, t0 + 1, t0 + period - 1, 600_000, 30_000);
    expect(ev.length).toBe(1); // the set at +12 h (start is already risen)
    expect(ev[0].type).toBe("set");
    expect(Math.abs(Date.parse(ev[0].utc) - (t0 + period / 2))).toBeLessThanOrEqual(60_000);
  });

  it("windowStats fractions are exact for a square-wave ephemeris", () => {
    // 4-day ephemeris: sun up exactly half the time (12 h on / 12 h off).
    const stepS = 1800;
    const count = 4 * 48 + 1;
    const sunEl: number[] = [];
    for (let i = 0; i < count; i++) sunEl.push(Math.floor((i % 48) / 24) === 0 ? 10 : -10);
    const eph: SiteEphemeris = {
      siteId: "x", startUtc: "2027-01-01T00:00:00Z", stepS, count,
      sunAz: new Array(count).fill(180), sunEl,
      earthAz: new Array(count).fill(0), earthEl: new Array(count).fill(5),
    };
    const mask = {
      azStepDeg: 0.1,
      horizonElDeg: new Array(3600).fill(0),
      horizonDistKm: new Array(3600).fill(0),
      smoothRefDeg: -0.087,
    } as unknown as HorizonMask;
    const acc = makeEphAccessor(eph);
    const w = windowStats(acc, mask, acc.startMs, 4);
    expect(w.sunlitFrac).toBeGreaterThan(0.45);
    expect(w.sunlitFrac).toBeLessThan(0.55);
    expect(w.earthFrac).toBe(1);
    expect(w.longestDarkH).toBeGreaterThan(11);
    expect(w.longestDarkH).toBeLessThan(13.1);
  });

  it("stereographic round trip", () => {
    for (const [la, lo] of [[-80.13, 1.44], [-84.7906, 29.1957], [-89.66, 129.2]]) {
      const { x, y } = southStereo(la, lo);
      const inv = southStereoInverse(x, y);
      expect(inv.latDeg).toBeCloseTo(la, 9);
      expect(inv.lonDeg).toBeCloseTo(lo, 9);
    }
  });
});

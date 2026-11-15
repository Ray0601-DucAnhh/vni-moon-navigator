/** Level A baseline for ANY coordinate the user types in (no terrain).
 *
 *  Sun and Earth azimuth/elevation are computed in the browser from the
 *  geocentric sub-solar and sub-Earth points (JPL Horizons, already shipped in
 *  moon-geocentric.json): elevation above the local horizontal plane of a
 *  spherical Moon, with topocentric parallax for the Earth (mean Earth-Moon
 *  distance). Validated against the per-site Horizons topocentric series
 *  (SV-6, tests/customPoint.test.ts). The horizon is flat (0 deg), so results
 *  are a baseline only: real terrain can change them by several degrees. The
 *  app never supplies coordinates itself - the user does. */

import type { HorizonMask, MoonGeocentric, SiteEphemeris } from "../../types";
import { parseIsoUtc } from "../../lib/time";
import { lerpAzDeg, makeEphAccessor, type EphAccessor } from "./core";

const D2R = Math.PI / 180;
const R_MOON_KM = 1737.4;
const EARTH_MOON_KM = 384_400; // mean distance; ~+/-5.5% variation -> <0.03 deg in elevation
const SUN_KM = 149_597_870.7;

type V3 = [number, number, number];
const unit = (latDeg: number, lonDeg: number): V3 => {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Interpolated sub-point (same rule as the globe lighting). */
function subPoint(geo: MoonGeocentric, lon: number[], lat: number[], tMs: number) {
  const x = (tMs - parseIsoUtc(geo.startUtc)) / (geo.stepS * 1000);
  const i = Math.min(geo.count - 2, Math.max(0, Math.floor(x)));
  const f = Math.min(1, Math.max(0, x - i));
  return { lat: lat[i] + (lat[i + 1] - lat[i]) * f, lonE: lerpAzDeg(lon[i], lon[i + 1], f) };
}

/** Az/el (deg) of a body at distance distKm along the Moon-centred direction
 *  to its sub-point, seen from (latDeg, lonDeg) at heightKm above the sphere. */
function topo(latDeg: number, lonDeg: number, heightKm: number, sub: { lat: number; lonE: number }, distKm: number) {
  const up = unit(latDeg, lonDeg);
  const lo = lonDeg * D2R;
  const la = latDeg * D2R;
  const east: V3 = [-Math.sin(lo), Math.cos(lo), 0];
  const north: V3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const b = unit(sub.lat, sub.lonE);
  const r = R_MOON_KM + heightKm;
  const v: V3 = [b[0] * distKm - up[0] * r, b[1] * distKm - up[1] * r, b[2] * distKm - up[2] * r];
  const n = Math.hypot(v[0], v[1], v[2]);
  const elDeg = Math.asin(Math.max(-1, Math.min(1, dot(v, up) / n))) / D2R;
  const azDeg = ((Math.atan2(dot(v, east), dot(v, north)) / D2R) % 360 + 360) % 360;
  return { azDeg, elDeg };
}

export function skyAt(geo: MoonGeocentric, latDeg: number, lonDeg: number, heightKm: number, tMs: number) {
  return {
    sun: topo(latDeg, lonDeg, heightKm, subPoint(geo, geo.subSolarLonE, geo.subSolarLat, tMs), SUN_KM),
    earth: topo(latDeg, lonDeg, heightKm, subPoint(geo, geo.subEarthLonE, geo.subEarthLat, tMs), EARTH_MOON_KM),
  };
}

/** A pseudo-site for any coordinate: 30-minute ephemeris from skyAt and a
 *  flat 0-deg horizon, so every existing app function (state, countdowns,
 *  operation windows) works on it unchanged. */
export function makeCustomPoint(geo: MoonGeocentric, latDeg: number, lonDeg: number): { acc: EphAccessor; mask: HorizonMask; eph: SiteEphemeris } {
  const stepS = 1800;
  const t0 = parseIsoUtc(geo.startUtc);
  const count = Math.floor(((geo.count - 1) * geo.stepS) / stepS) + 1;
  const eph: SiteEphemeris = { siteId: "custom", startUtc: geo.startUtc, stepS, count, sunAz: [], sunEl: [], earthAz: [], earthEl: [] };
  for (let k = 0; k < count; k++) {
    const p = skyAt(geo, latDeg, lonDeg, 0, t0 + k * stepS * 1000);
    eph.sunAz.push(p.sun.azDeg);
    eph.sunEl.push(p.sun.elDeg);
    eph.earthAz.push(p.earth.azDeg);
    eph.earthEl.push(p.earth.elDeg);
  }
  const mask = {
    siteId: "custom",
    azStepDeg: 0.1,
    horizonElDeg: new Array(3600).fill(0),
    horizonDistKm: new Array(3600).fill(0),
    observerHeightM: 0,
    demHeightM: 0,
    smoothRefDeg: 0,
    demFiles: [],
    effectiveResM: null,
    maxRangeKm: 0,
    nanSamples: 0,
    generated: "client (Level A baseline)",
    resolutionNote: "Level A baseline: flat 0° horizon, no terrain",
  } as unknown as HorizonMask;
  return { acc: makeEphAccessor(eph), mask, eph };
}

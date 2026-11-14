/** Data & science validation battery. Offline checks always run; online
 *  checks (SV-2 spot re-queries, SV-3 interpolation error, SV-4 NASA SVS
 *  cross-check) run with --online. Results are printed AND written to
 *  data-raw/validation/validation-results.json for docs/validation/.
 *
 *  Checks (plan v1.1 §4.3): TV-1 site height vs LROC; TV-4 independent
 *  chord-formula recomputation of exported horizon points; TV-5 near-field
 *  resolution sensitivity; TV-6 range sensitivity; TV-7 PSR stays dark;
 *  TV-8 IM-1 coordinate-uncertainty sensitivity; TV-10 app-vs-pipeline
 *  consistency; SV-1 header assertions on the saved raw files; plus schema
 *  and manifest-checksum checks.
 *
 *  Usage: npm run data:validate [-- --online] */

import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import {
  DATA_PUBLIC, DATA_RAW, DEM_CACHE, log, readJson, round, sha256File, writeJsonPretty,
} from "../lib/common";
import {
  earthClearance, makeEphAccessor, stateFromEvents, sunClearance, horizonElAt,
} from "../../src/services/science/core";
import { R_MOON_M, latLonToUnit } from "../../src/lib/coords";
import { parseIsoUtc, toIsoUtc } from "../../src/lib/time";
import type { HorizonMask, Site, SiteDerived, SiteEphemeris } from "../../src/types";

interface CheckResult {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "INFO" | "SKIPPED";
  detail: string;
  values?: unknown;
}

const results: CheckResult[] = [];
function record(r: CheckResult): void {
  results.push(r);
  log(`${r.status.padEnd(7)} ${r.id}: ${r.name} - ${r.detail}`);
}

function maskStats(a: number[], b: number[]): { maxAbs: number; rms: number } {
  let maxAbs = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxAbs) maxAbs = d;
    sum += d * d;
  }
  return { maxAbs: round(maxAbs, 4), rms: round(Math.sqrt(sum / a.length), 4) };
}

async function main(): Promise<void> {
  const online = process.argv.includes("--online");
  const sitesDoc = await readJson<{ sites: Site[] }>(path.join(DATA_PUBLIC, "sites.json"));
  const analysed = sitesDoc.sites.filter((s) => s.analysed);
  const V = (f: string) => path.join(DATA_RAW, "validation", f);

  // ---- Schema / shape checks -------------------------------------------
  for (const s of analysed) {
    const eph = await readJson<SiteEphemeris>(path.join(DATA_PUBLIC, "ephemeris", `${s.id}.json`));
    const mask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", `${s.id}.json`));
    const der = await readJson<SiteDerived>(path.join(DATA_PUBLIC, "derived", `${s.id}.json`));
    const okLen =
      eph.sunAz.length === eph.count && eph.sunEl.length === eph.count &&
      eph.earthAz.length === eph.count && eph.earthEl.length === eph.count;
    const okMask = mask.horizonElDeg.length === 3600 && mask.horizonDistKm.length === 3600;
    const okDer = der.dailyDates.length === der.dailySunlitFrac.length && der.dailyDates.length >= 360;
    record({
      id: "SHAPE",
      name: `${s.id} data shapes`,
      status: okLen && okMask && okDer ? "PASS" : "FAIL",
      detail: `eph ${eph.count} samples, mask ${mask.horizonElDeg.length} bins, ${der.dailyDates.length} daily rows, nanSamples ${mask.nanSamples}`,
    });
  }

  // ---- SV-1: header assertions on saved raw files ----------------------
  {
    const rawDir = path.join(DATA_RAW, "horizons");
    const files = (await readdir(rawDir)).filter((f) => f.endsWith(".txt"));
    let bad = 0;
    for (const f of files) {
      const t = await readFile(path.join(rawDir, f), "utf8");
      const geo = f.startsWith("moon_geo");
      const frameOk = t.includes("MEAN_ME") || (geo && t.includes("MOON_ME"));
      const airlessOk = geo || /Atmos refraction:\s*NO \(AIRLESS\)/.test(t);
      if (!frameOk || !airlessOk || !/1737\.4/.test(t)) bad++;
    }
    record({
      id: "SV-1",
      name: "Horizons headers (frame MEAN_ME, radius 1737.4, AIRLESS)",
      status: bad === 0 && files.length >= 9 ? "PASS" : "FAIL",
      detail: `${files.length} raw files checked, ${bad} bad`,
    });
  }

  // ---- TV-1: site DEM height vs LROC published -------------------------
  {
    const mask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", "im1.json"));
    const im1 = analysed.find((s) => s.id === "im1")!;
    const diff = mask.demHeightM - (im1.publishedElevM ?? NaN);
    record({
      id: "TV-1",
      name: "IM-1 DEM height vs LROC 2579 m",
      status: Math.abs(diff) <= 50 ? "PASS" : "FAIL",
      detail: `DEM ${mask.demHeightM} m, LROC ${im1.publishedElevM} m, diff ${round(diff, 1)} m (tolerance +/-50 m)`,
    });
  }

  // ---- TV-4: independent chord-formula recomputation --------------------
  for (const s of analysed) {
    const mask = (await readJson<HorizonMask & { tv4?: Record<string, number>[] }>(
      path.join(DATA_PUBLIC, "horizon", `${s.id}.json`),
    ));
    let worst = 0;
    const rows: Record<string, number>[] = [];
    for (const p of mask.tv4 ?? []) {
      // Independent scalar path: chord formula from exported point scalars.
      const uO = latLonToUnit(s.latDeg, s.lonDeg);
      const uP = latLonToUnit(p.pointLatDeg, p.pointLonDeg);
      const cosSig = Math.max(-1, Math.min(1, uO.x * uP.x + uO.y * uP.y + uO.z * uP.z));
      const rO = R_MOON_M + p.observerHeightM;
      const rP = R_MOON_M + p.pointHeightM;
      const chord = Math.sqrt(rP * rP + rO * rO - 2 * rP * rO * cosSig);
      const el = (Math.asin((rP * cosSig - rO) / chord) * 180) / Math.PI;
      const d = Math.abs(el - p.horizonElDeg);
      worst = Math.max(worst, d);
      rows.push({ azDeg: p.azDeg, maskElDeg: p.horizonElDeg, chordElDeg: round(el, 4), diffDeg: round(d, 5) });
    }
    record({
      id: "TV-4",
      name: `${s.id} chord-formula recomputation (3 azimuths)`,
      status: worst <= 0.01 ? "PASS" : "FAIL",
      detail: `max |diff| ${round(worst, 5)} deg (tolerance 0.01)`,
      values: rows,
    });
  }

  // ---- TV-5 / TV-6: sensitivity variants --------------------------------
  for (const s of analysed) {
    const base = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", `${s.id}.json`));
    const no20p = V(`horizon-${s.id}-no20.json`);
    if (existsSync(no20p)) {
      const v = await readJson<HorizonMask>(no20p);
      const st = maskStats(base.horizonElDeg, v.horizonElDeg);
      record({
        id: "TV-5",
        name: `${s.id} near-field resolution (20 m vs 80 m only)`,
        status: st.rms <= 0.2 ? "PASS" : "INFO",
        detail: `max ${st.maxAbs} deg, RMS ${st.rms} deg (RMS target <= 0.2; larger => shown as limitation)`,
        values: st,
      });
    }
    for (const variant of ["r150", "r500"]) {
      const p = V(`horizon-${s.id}-${variant}.json`);
      if (!existsSync(p)) continue;
      const v = await readJson<HorizonMask>(p);
      const st = maskStats(base.horizonElDeg, v.horizonElDeg);
      record({
        id: "TV-6",
        name: `${s.id} range sensitivity (300 km vs ${variant.slice(1)} km)`,
        status: variant === "r500" ? (st.maxAbs < 0.05 ? "PASS" : "INFO") : "INFO",
        detail: `max ${st.maxAbs} deg, RMS ${st.rms} deg${variant === "r500" ? " (300->500 km target max < 0.05)" : ""}`,
        values: st,
      });
    }
  }

  // ---- TV-7: PSR point stays dark all year ------------------------------
  {
    const maskP = V("horizon-psr1-default.json");
    const ephP = V("eph-psr1-sun.json");
    if (existsSync(maskP) && existsSync(ephP)) {
      const mask = await readJson<HorizonMask>(maskP);
      const eph = await readJson<{ startUtc: string; stepS: number; count: number; sunAz: number[]; sunEl: number[] }>(ephP);
      let maxClear = -Infinity;
      let sunlitSamples = 0;
      for (let i = 0; i < eph.count; i++) {
        const c = eph.sunEl[i] - horizonElAt(mask, eph.sunAz[i]);
        if (c > maxClear) maxClear = c;
        if (c >= 0) sunlitSamples++;
      }
      record({
        id: "TV-7",
        name: "PSR check: Shackleton-interior point (-89.66, 129.2E; LPSR flag = 1) never sunlit",
        status: sunlitSamples === 0 ? "PASS" : "FAIL",
        detail: `max Sun clearance ${round(maxClear, 3)} deg over ${eph.count} hourly samples; sunlit samples ${sunlitSamples}. LPSR_80S_20MPP_ADJ value 1 at point, 0 at IM-2 (probe 2026-11-14).`,
      });
    } else {
      record({ id: "TV-7", name: "PSR check", status: "SKIPPED", detail: "psr1 artifacts missing" });
    }
  }

  // ---- TV-8: IM-1 coordinate-uncertainty sensitivity --------------------
  {
    const base = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", "im1.json"));
    const offs = ["im1n", "im1s", "im1e", "im1w"];
    const stats: Record<string, unknown>[] = [];
    let present = 0;
    for (const o of offs) {
      const p = V(`horizon-${o}-default.json`);
      if (!existsSync(p)) continue;
      present++;
      const v = await readJson<HorizonMask>(p);
      const st = maskStats(base.horizonElDeg, v.horizonElDeg);
      stats.push({ offset: o, demHeightM: v.demHeightM, ...st });
    }
    record({
      id: "TV-8",
      name: "IM-1 +/-300 m coordinate sensitivity (published precision ~0.01 deg)",
      status: present === 4 ? "INFO" : "SKIPPED",
      detail: `4 offsets; horizon differs by up to ${Math.max(...stats.map((s) => (s as { maxAbs: number }).maxAbs))} deg - reported as an uncertainty note in the IM-1 panel`,
      values: stats,
    });
  }

  // ---- TV-10: app functions vs derived files ----------------------------
  for (const s of analysed) {
    const eph = await readJson<SiteEphemeris>(path.join(DATA_PUBLIC, "ephemeris", `${s.id}.json`));
    const mask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", `${s.id}.json`));
    const der = await readJson<SiteDerived>(path.join(DATA_PUBLIC, "derived", `${s.id}.json`));
    const acc = makeEphAccessor(eph);
    let bad = 0;
    const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed / 2 ** 31);
    const rand = rng(s.id === "im2" ? 42 : 1337);
    for (let k = 0; k < 12; k++) {
      const t = acc.startMs + Math.floor(rand() * (acc.endMs - acc.startMs - 7_200_000)) + 3_600_000;
      const sunUp = sunClearance(acc, mask, t) >= 0;
      const earthUp = earthClearance(acc, mask, t) >= 0;
      const evSun = stateFromEvents(der.sunEvents, t);
      const evEarth = stateFromEvents(der.earthEvents, t);
      // Within 2 minutes of an event the states may legitimately differ.
      const nearEvent = [...der.sunEvents, ...der.earthEvents].some(
        (e) => Math.abs(parseIsoUtc(e.utc) - t) < 120_000,
      );
      if (!nearEvent) {
        if (evSun !== null && evSun !== sunUp) bad++;
        if (evEarth !== null && evEarth !== earthUp) bad++;
      }
    }
    record({
      id: "TV-10",
      name: `${s.id} recomputed state vs derived events (12 random instants)`,
      status: bad === 0 ? "PASS" : "FAIL",
      detail: `${bad} mismatches`,
    });
  }

  // ---- Manifest checksums ----------------------------------------------
  {
    const manifest = await readJson<{ entries: { kind: string; file: string; sha256?: string }[] }>(
      path.join(DATA_PUBLIC, "manifest.json"),
    );
    let bad = 0;
    let n = 0;
    for (const e of manifest.entries.filter((x) => x.kind === "dem-cache" && x.sha256)) {
      n++;
      const p = path.join(DEM_CACHE, e.file);
      if (!existsSync(p) || (await sha256File(p)) !== e.sha256) bad++;
    }
    record({
      id: "MANIFEST",
      name: "DEM cache checksums vs manifest",
      status: bad === 0 ? "PASS" : "FAIL",
      detail: `${n} files, ${bad} mismatches`,
    });
  }

  // ---- Online checks ----------------------------------------------------
  if (online) {
    // SV-2: spot re-queries of single instants vs stored series.
    for (const s of analysed) {
      const eph = await readJson<SiteEphemeris>(path.join(DATA_PUBLIC, "ephemeris", `${s.id}.json`));
      const mask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", `${s.id}.json`));
      const startMs = parseIsoUtc(eph.startUtc);
      let worst = 0;
      for (const [body, az, el] of [["10", eph.sunAz, eph.sunEl], ["399", eph.earthAz, eph.earthEl]] as const) {
        for (const idx of [4000, 12000]) {
          const t = startMs + idx * eph.stepS * 1000;
          const iso = toIsoUtc(t).replace("T", " ").replace("Z", "");
          const alt = (mask.demHeightM + mask.observerHeightM) / 1000;
          const url =
            `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='${body}'&OBJ_DATA='NO'&MAKE_EPHEM='YES'` +
            `&EPHEM_TYPE='OBSERVER'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='${s.lonDeg},${s.latDeg},${alt.toFixed(6)}'` +
            `&START_TIME='${encodeURIComponent(iso)}'&STOP_TIME='${encodeURIComponent(iso.slice(0, -5) + (Number(iso.slice(-5, -3)) + 1).toString().padStart(2, "0") + iso.slice(-3))}'` +
            `&STEP_SIZE='1 min'&QUANTITIES='4'&CSV_FORMAT='YES'`;
          const text = await (await fetch(url)).text();
          const i = text.indexOf("$$SOE");
          const row = text.slice(i + 5).trim().split("\n")[0].split(",");
          const dAz = Math.abs(((Number(row[3]) - az[idx] + 540) % 360) - 180);
          const dEl = Math.abs(Number(row[4]) - el[idx]);
          worst = Math.max(worst, dAz, dEl);
        }
      }
      record({
        id: "SV-2",
        name: `${s.id} spot re-queries (2 instants x Sun+Earth)`,
        status: worst <= 0.01 ? "PASS" : "FAIL",
        detail: `max |diff| ${round(worst, 5)} deg (tolerance 0.01; stored values rounded to 4 dp)`,
      });
    }

    // SV-3: 10-min Horizons day vs linear interpolation of 30-min samples.
    {
      const s = analysed.find((x) => x.id === "im2")!;
      const eph = await readJson<SiteEphemeris>(path.join(DATA_PUBLIC, "ephemeris", "im2.json"));
      const mask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", "im2.json"));
      const acc = makeEphAccessor(eph);
      const alt = ((mask.demHeightM + mask.observerHeightM) / 1000).toFixed(6);
      const url =
        `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='10'&OBJ_DATA='NO'&MAKE_EPHEM='YES'` +
        `&EPHEM_TYPE='OBSERVER'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='${s.lonDeg},${s.latDeg},${alt}'` +
        `&START_TIME='2027-03-01'&STOP_TIME='2027-03-02'&STEP_SIZE='10 min'&QUANTITIES='4'&CSV_FORMAT='YES'`;
      const text = await (await fetch(url)).text();
      const i = text.indexOf("$$SOE");
      const j = text.indexOf("$$EOE");
      let worstEl = 0;
      let worstAz = 0;
      for (const line of text.slice(i + 5, j).trim().split("\n")) {
        const parts = line.split(",").map((p) => p.trim());
        const tMs = Date.UTC(2027, 2, Number(parts[0].slice(9, 11)), Number(parts[0].slice(12, 14)), Number(parts[0].slice(15, 17)));
        const ref = { az: Number(parts[3]), el: Number(parts[4]) };
        const got = acc.sun(tMs);
        worstEl = Math.max(worstEl, Math.abs(got.elDeg - ref.el));
        worstAz = Math.max(worstAz, Math.abs(((got.azDeg - ref.az + 540) % 360) - 180));
      }
      record({
        id: "SV-3",
        name: "im2 interpolation error vs 10-min Horizons day (2027-03-01, Sun)",
        status: worstEl <= 0.05 ? "PASS" : "FAIL",
        detail: `max |el diff| ${round(worstEl, 4)} deg (target <= 0.05); max |az diff| ${round(worstAz, 4)} deg (azimuth drifts fast near the pole; horizon lookup error = az diff x horizon slope, reported INFO)`,
      });
    }

    // SV-4: sub-solar point vs NASA SVS dial-a-moon (3 instants).
    {
      const geo = await readJson<{ startUtc: string; stepS: number; subSolarLonE: number[]; subSolarLat: number[] }>(
        path.join(DATA_PUBLIC, "ephemeris", "moon-geocentric.json"),
      );
      const startMs = parseIsoUtc(geo.startUtc);
      let worst = 0;
      let checked = 0;
      let detail = "";
      try {
        // dial-a-moon serves the current year's product only; 2027 requests return
        // a frozen default (checked 2026-11-14), so all instants stay inside 2026.
        for (const idx of [100, 700, 1400]) {
          const t = startMs + idx * geo.stepS * 1000;
          const iso = toIsoUtc(t).slice(0, 16);
          const res = await fetch(`https://svs.gsfc.nasa.gov/api/dialamoon/${iso}`);
          if (!res.ok) throw new Error(`dialamoon ${res.status}`);
          const j = (await res.json()) as { subsolar_lon: number; subsolar_lat: number };
          const dLon = Math.abs(((geo.subSolarLonE[idx] - j.subsolar_lon + 540) % 360) - 180);
          const dLat = Math.abs(geo.subSolarLat[idx] - j.subsolar_lat);
          worst = Math.max(worst, dLon, dLat);
          checked++;
        }
        detail = `max |diff| ${round(worst, 3)} deg over ${checked} instants (tolerance 0.2)`;
      } catch (e) {
        detail = `SVS API unavailable: ${(e as Error).message}`;
      }
      record({
        id: "SV-4",
        name: "sub-solar point vs NASA SVS dial-a-moon",
        status: checked === 3 ? (worst <= 0.2 ? "PASS" : "FAIL") : "SKIPPED",
        detail,
      });
    }
  } else {
    record({ id: "ONLINE", name: "SV-2/SV-3/SV-4", status: "SKIPPED", detail: "run with --online" });
  }

  const fails = results.filter((r) => r.status === "FAIL").length;
  await writeJsonPretty(V("validation-results.json"), {
    generated: new Date().toISOString(),
    online,
    results,
  });
  log(`---- ${results.length} checks, ${fails} FAIL ----`);
  if (fails > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

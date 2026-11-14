/** Derive terrain-aware events and daily summaries for each analysed site,
 *  using exactly the same science core as the app UI and the AI tools.
 *
 *  - Events: zero-crossings of (body elevation - terrain horizon at the
 *    body's azimuth); 10-minute coarse scan, bisected to <= 30 s and
 *    rounded to the minute. Events shorter than 10 minutes can be missed
 *    (documented limitation).
 *  - Daily summaries: fraction of each UTC day in each state, 10-min grid.
 *
 *  Usage: npm run data:derive */

import path from "node:path";
import { DATA_PUBLIC, log, readJson, round, updateManifest, writeJson } from "../lib/common";
import {
  earthClearance, findCrossings, makeEphAccessor, sunClearance,
} from "../../src/services/science/core";
import { parseIsoUtc, toIsoUtc, utcDateOnly, DAY_MS } from "../../src/lib/time";
import type { HorizonMask, Site, SiteEphemeris } from "../../src/types";

async function main(): Promise<void> {
  const sitesDoc = await readJson<{ sites: Site[] }>(path.join(DATA_PUBLIC, "sites.json"));
  for (const s of sitesDoc.sites.filter((x) => x.analysed)) {
    const eph = await readJson<SiteEphemeris>(path.join(DATA_PUBLIC, "ephemeris", `${s.id}.json`));
    const mask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", `${s.id}.json`));
    const acc = makeEphAccessor(eph);
    const coarse = 10 * 60_000;
    const refine = 30_000;
    const sunEvents = findCrossings((t) => sunClearance(acc, mask, t), acc.startMs, acc.endMs, coarse, refine);
    const earthEvents = findCrossings((t) => earthClearance(acc, mask, t), acc.startMs, acc.endMs, coarse, refine);

    const dailyDates: string[] = [];
    const dailySunlitFrac: number[] = [];
    const dailyEarthFrac: number[] = [];
    for (let d0 = acc.startMs; d0 + DAY_MS <= acc.endMs; d0 += DAY_MS) {
      let sun = 0;
      let earth = 0;
      let n = 0;
      for (let t = d0; t < d0 + DAY_MS; t += coarse) {
        n++;
        if (sunClearance(acc, mask, t) >= 0) sun++;
        if (earthClearance(acc, mask, t) >= 0) earth++;
      }
      dailyDates.push(utcDateOnly(d0));
      dailySunlitFrac.push(round(sun / n, 4));
      dailyEarthFrac.push(round(earth / n, 4));
    }

    const doc = {
      siteId: s.id,
      windowStartUtc: toIsoUtc(acc.startMs, true),
      windowEndUtc: toIsoUtc(acc.endMs, true),
      sunEvents,
      earthEvents,
      dailyDates,
      dailySunlitFrac,
      dailyEarthFrac,
    };
    await writeJson(path.join(DATA_PUBLIC, "derived", `${s.id}.json`), doc);

    const meanSun = dailySunlitFrac.reduce((a, b) => a + b, 0) / dailySunlitFrac.length;
    const meanEarth = dailyEarthFrac.reduce((a, b) => a + b, 0) / dailyEarthFrac.length;
    log(
      `${s.id}: ${sunEvents.length} sun events, ${earthEvents.length} earth events; ` +
        `year means: sunlit ${(meanSun * 100).toFixed(1)}%, earth-visible ${(meanEarth * 100).toFixed(1)}%`,
    );
    await updateManifest([
      {
        kind: "derived",
        file: `derived/${s.id}.json`,
        retrieved: new Date().toISOString(),
        note: "Terrain-aware events (10-min scan, bisected to <=30 s) and daily fractions (10-min grid). Earth events are geometric line of sight to the Earth CENTRE - not a communication link.",
        sunEvents: sunEvents.length,
        earthEvents: earthEvents.length,
        yearSunlitPct: round(meanSun * 100, 2),
        yearEarthPct: round(meanEarth * 100, 2),
      },
    ]);
    // Sanity guard: the derived window must stay inside the ephemeris.
    if (parseIsoUtc(doc.windowStartUtc) !== acc.startMs) throw new Error("window mismatch");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

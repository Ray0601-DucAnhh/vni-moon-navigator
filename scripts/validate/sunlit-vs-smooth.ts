/** Year-long terrain vs smooth-Moon sunlit fractions per site, plus the
 *  horizon elevation along the Sun's yearly azimuth track - used to explain
 *  sites where terrain-aware sunlight exceeds the smooth reference. */
import path from "node:path";
import { DATA_PUBLIC, readJson, round } from "../lib/common";
import { horizonElAt, makeEphAccessor, windowStats } from "../../src/services/science/core";
import type { HorizonMask, Site, SiteEphemeris } from "../../src/types";
const { sites } = await readJson<{ sites: Site[] }>(path.join(DATA_PUBLIC, "sites.json"));
for (const s of sites) {
  const eph = await readJson<SiteEphemeris>(path.join(DATA_PUBLIC, "ephemeris", `${s.id}.json`));
  const mask = await readJson<HorizonMask>(path.join(DATA_PUBLIC, "horizon", `${s.id}.json`));
  const acc = makeEphAccessor(eph);
  const w = windowStats(acc, mask, acc.startMs, 365);
  // Horizon along azimuths the Sun crosses the 0-deg plane (sunrise/sunset directions).
  const cross: number[] = [];
  for (let i = 1; i < eph.count; i++) {
    if ((eph.sunEl[i - 1] < 0) !== (eph.sunEl[i] < 0)) cross.push(horizonElAt(mask, eph.sunAz[i]));
  }
  console.log(
    `${s.id.padEnd(5)} terrain ${(w.sunlitFrac * 100).toFixed(2)}%  smooth ${(w.smoothSunlitFrac * 100).toFixed(2)}%  ` +
    `horizon at sunrise/sunset azimuths: ${round(Math.min(...cross), 3)}..${round(Math.max(...cross), 3)} deg  ` +
    `mask range ${round(Math.min(...mask.horizonElDeg), 2)}..${round(Math.max(...mask.horizonElDeg), 2)}`,
  );
}

/** Copy the TV-5 resolution-sensitivity result (near-field DEM coarsened ~4x)
 *  into each shipped horizon mask, so the app can show it next to the
 *  terrain data. Pure annotation: horizon values are not changed.
 *  Usage: npx tsx scripts/validate/annotate-sensitivity.ts */

import path from "node:path";
import { existsSync } from "node:fs";
import { DATA_PUBLIC, DATA_RAW, log, readJson, round, writeJson } from "../lib/common";
import type { HorizonMask, Site } from "../../src/types";

const { sites } = await readJson<{ sites: Site[] }>(path.join(DATA_PUBLIC, "sites.json"));
for (const s of sites) {
  const mp = path.join(DATA_PUBLIC, "horizon", `${s.id}.json`);
  const vp = path.join(DATA_RAW, "validation", `horizon-${s.id}-no20.json`);
  if (!existsSync(vp)) {
    log(`${s.id}: no TV-5 variant - skipped`);
    continue;
  }
  const m = await readJson<HorizonMask & Record<string, unknown>>(mp);
  const v = await readJson<HorizonMask>(vp);
  let sum = 0;
  let max = 0;
  for (let i = 0; i < m.horizonElDeg.length; i++) {
    const d = Math.abs(m.horizonElDeg[i] - v.horizonElDeg[i]);
    sum += d * d;
    if (d > max) max = d;
  }
  m.resolutionSensitivity = {
    rmsDeg: round(Math.sqrt(sum / m.horizonElDeg.length), 3),
    maxDeg: round(max, 3),
    comparedWith: v.demFiles.join(", "),
  };
  await writeJson(mp, m);
  log(`${s.id}: RMS ${(m.resolutionSensitivity as { rmsDeg: number }).rmsDeg} deg`);
}

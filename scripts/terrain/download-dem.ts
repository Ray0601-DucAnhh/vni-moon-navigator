/** Ensure the local DEM cache holds the full 80 m and 240 m LOLA products,
 *  verify their sizes against the PGDA server, record SHA-256 checksums in
 *  public/data/manifest.json. The 2.7 GB 20 m product is NOT downloaded in
 *  full; build-horizon-masks.ts range-reads a window around each site.
 *
 *  Usage: npm run data:dem */

import { existsSync } from "node:fs";
import { stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DEM_CACHE, DEM_FILES, PGDA_BASE, log, sha256File, updateManifest } from "../lib/common";

async function remoteSize(url: string): Promise<number> {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`HEAD ${url} -> ${res.status}`);
  return Number(res.headers.get("content-length"));
}

async function ensure(file: string): Promise<void> {
  const url = `${PGDA_BASE}/${file}`;
  const dest = path.join(DEM_CACHE, file);
  const want = await remoteSize(url);
  const have = existsSync(dest) ? (await stat(dest)).size : 0;
  if (have !== want) {
    log(`${file}: have ${have} of ${want} bytes - downloading (curl, resumable)...`);
    execFileSync("curl", ["-sS", "--retry", "5", "--retry-all-errors", "-C", "-", "-o", dest, url], {
      stdio: "inherit",
    });
    const now = (await stat(dest)).size;
    if (now !== want) throw new Error(`${file}: size ${now} != expected ${want}`);
  }
  const hash = await sha256File(dest);
  log(`${file}: ${want} bytes, sha256 ${hash.slice(0, 16)}...`);
  await updateManifest([
    {
      kind: "dem-cache",
      file,
      source: url,
      retrieved: new Date().toISOString(),
      sha256: hash,
      bytes: want,
      note: "Local cache (gitignored); LOLA south polar stereographic DEM, MOON_ME (DE421), heights vs 1737.4 km sphere. Cite Barker et al. 2023 PSJ 4:183; data DOI 10.60903/gsfcpgda-lola-spole (S34).",
    },
  ]);
}

async function main(): Promise<void> {
  await mkdir(DEM_CACHE, { recursive: true });
  await ensure(DEM_FILES.m80);
  await ensure(DEM_FILES.m240);
  log("DEM cache ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

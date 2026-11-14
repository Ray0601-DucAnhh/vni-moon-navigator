/** Earth texture for the illustrative 3D Earth model: NASA Blue Marble Next
 *  Generation with topography & bathymetry (Earth Observatory; R. Stockli et
 *  al.), April 2004 composite, resized for the web. Illustrative only - the
 *  app does not model Earth's rotation or cloud cover.
 *  Usage: npx tsx scripts/assets/prepare-earth-texture.ts */

import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile, stat, appendFile, readFile } from "node:fs/promises";
import sharp from "sharp";
import { DATA_RAW, ROOT, log, sha256File, updateManifest } from "../lib/common";

const SRC_URL =
  "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/april/world.topo.bathy.200404.3x5400x2700.jpg";
const RAW = path.join(DATA_RAW, "textures", "world.topo.bathy.200404.3x5400x2700.jpg");
const OUT = path.join(ROOT, "public", "textures", "earth_bluemarble_1k.jpg");

async function main(): Promise<void> {
  await mkdir(path.dirname(RAW), { recursive: true });
  if (!existsSync(RAW)) {
    log(`downloading ${SRC_URL}`);
    const res = await fetch(SRC_URL);
    if (!res.ok) throw new Error(`${SRC_URL} -> ${res.status}`);
    await writeFile(RAW, Buffer.from(await res.arrayBuffer()));
  }
  log(`source ${((await stat(RAW)).size / 1e6).toFixed(1)} MB`);
  await sharp(RAW).resize(1024, 512).jpeg({ quality: 80, mozjpeg: true }).toFile(OUT);
  log(`${path.basename(OUT)}: ${((await stat(OUT)).size / 1024).toFixed(0)} kB`);
  await updateManifest([
    {
      kind: "texture",
      file: "textures/earth_bluemarble_1k.jpg",
      source: SRC_URL,
      retrieved: new Date().toISOString(),
      sha256: await sha256File(OUT),
      note: "NASA Earth Observatory Blue Marble Next Generation (topography & bathymetry, April 2004), resized to 1024x512. Illustrative Earth model only; rotation and clouds not modelled.",
    },
  ]);
  const src = path.join(ROOT, "public", "textures", "SOURCE.md");
  const cur = await readFile(src, "utf8");
  if (!cur.includes("Blue Marble")) {
    await appendFile(
      src,
      [
        "",
        "",
        "## Earth texture (earth_bluemarble_1k.jpg)",
        `- Source: ${SRC_URL} - NASA Earth Observatory “Blue Marble Next Generation” with topography and bathymetry (R. Stöckli, NASA GSFC), April 2004 composite.`,
        "- Processing: resized to 1024x512 JPEG by scripts/assets/prepare-earth-texture.ts.",
        "- Used only for the illustrative 3D Earth model (size, distance and rotation are not to scale / not modelled).",
      ].join("\n"),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

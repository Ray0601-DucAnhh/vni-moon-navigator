/** Download the NASA SVS CGI Moon Kit colour map (2025 poles-filled version)
 *  and produce the web textures. Credit: NASA SVS / Ernie Wright; LROC WAC
 *  mosaic + LOLA. NASA notes the map is "optimized for aesthetics, not
 *  science" - the app labels surface shading as illustrative.
 *
 *  Usage: npm run texture */

import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { DATA_RAW, ROOT, log, sha256File, updateManifest } from "../lib/common";

const SRC_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif";
const RAW = path.join(DATA_RAW, "textures", "lroc_color_poles_4k.tif");
const OUT_DIR = path.join(ROOT, "public", "textures");

async function main(): Promise<void> {
  await mkdir(path.dirname(RAW), { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  if (!existsSync(RAW)) {
    log(`downloading ${SRC_URL} ...`);
    const res = await fetch(SRC_URL);
    if (!res.ok) throw new Error(`${SRC_URL} -> ${res.status}`);
    await writeFile(RAW, Buffer.from(await res.arrayBuffer()));
  }
  log(`source: ${((await stat(RAW)).size / 1e6).toFixed(1)} MB, sha256 ${(await sha256File(RAW)).slice(0, 16)}...`);

  const img = sharp(RAW);
  const meta = await img.metadata();
  log(`source dimensions: ${meta.width}x${meta.height}, ${meta.channels} ch`);
  await sharp(RAW).resize(4096, 2048).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT_DIR, "moon_color_4k.jpg"));
  await sharp(RAW).resize(2048, 1024).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT_DIR, "moon_color_2k.jpg"));
  for (const f of ["moon_color_4k.jpg", "moon_color_2k.jpg"]) {
    const p = path.join(OUT_DIR, f);
    log(`${f}: ${((await stat(p)).size / 1024).toFixed(0)} kB`);
    await updateManifest([
      {
        kind: "texture",
        file: `textures/${f}`,
        source: SRC_URL,
        retrieved: new Date().toISOString(),
        sha256: await sha256File(p),
        note: "CGI Moon Kit colour map (NASA SVS 4720, 2025 poles-filled version), resized + JPEG for the web. Aesthetic product; shading is illustrative.",
      },
    ]);
  }
  await writeFile(
    path.join(OUT_DIR, "SOURCE.md"),
    [
      "# Texture provenance",
      "",
      `- Source: ${SRC_URL} (NASA SVS “CGI Moon Kit”, svs.gsfc.nasa.gov/4720; visualisation by Ernie Wright, from the LROC WAC mosaic with LOLA data filling the poles).`,
      "- Processing: resized to 4096x2048 / 2048x1024 and JPEG-compressed by scripts/assets/prepare-texture.ts.",
      "- NASA SVS describes the map as “optimized for aesthetics, not science”; the app labels surface shading as illustrative.",
      "- NASA media usage guidelines apply (NASA imagery is generally not copyrighted; NASA does not endorse this project).",
    ].join("\n"),
  );
  log("textures ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

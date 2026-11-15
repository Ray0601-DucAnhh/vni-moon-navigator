/** Download openly licensed lander photos from Wikimedia Commons, verify each
 *  licence against an allow-list at download time, and write:
 *    public/images/landers/<id>.jpg       480x270 card image (popup)
 *    public/images/landers/<id>-icon.jpg  96x96 marker icon
 *    public/data/site-images.json         credit, licence, source, caption per site
 *  Usage: npx tsx scripts/assets/prepare-lander-images.ts
 *  Images are illustrative context only; no science depends on them. */

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { DATA_PUBLIC, log } from "../lib/common";

interface Pick {
  id: string;
  file: string; // Commons file title without "File:"
  kind: "on the Moon" | "before launch" | "full-scale model" | "scale model";
  caption: string;
  /** Optional square icon crop in the 480x270 card image (when the auto crop misses the lander). */
  iconBox?: { left: number; top: number; size: number };
}

const PICKS: Pick[] = [
  { id: "im2", file: "Intuitive Machines’ Nova-C lunar lander (IM 00309) (cropped).jpg", kind: "before launch",
    caption: "Intuitive Machines Nova-C lander, the same design as IM-2 Athena (photo shows the IM-1 lander before launch)." },
  { id: "im1", file: "Intuitive Machines’ Nova-C lunar lander (IM 00309) (cropped).jpg", kind: "before launch",
    caption: "IM-1 Nova-C lander Odysseus before launch." },
  { id: "a11", file: "As11-40-5927.jpg", kind: "on the Moon",
    caption: "Apollo 11 Lunar Module Eagle at Tranquility Base, with Buzz Aldrin (AS11-40-5927)." },
  { id: "a12", file: "Apollo-12-LM.jpg", kind: "on the Moon", caption: "Apollo 12 Lunar Module Intrepid on the Moon." },
  { id: "a14", file: "Apollo 14 Lunar Module (LM) on the moon.jpg", kind: "on the Moon",
    caption: "Apollo 14 Lunar Module Antares on the Moon (AS14-66-9277)." },
  { id: "a15", file: "Apollo 15 Lunar Module Falcon - 51358762770.jpg", kind: "on the Moon",
    caption: "Apollo 15 Lunar Module Falcon at Hadley-Apennine, tilted on a crater rim." },
  { id: "a16", file: "View of the Apollo 16 Lunar Module on the lunar surface (as16-113-18334).jpg", kind: "on the Moon",
    caption: "Apollo 16 Lunar Module Orion at Descartes (AS16-113-18334)." },
  { id: "a17", file: "Apollo 17 first test of the lunar rover AS17-147-22527HR.jpg", kind: "on the Moon",
    caption: "Apollo 17: Eugene Cernan tests the rover beside Lunar Module Challenger (AS17-147-22527)." },
  { id: "bg1", file: "Firefly Blue Ghost lander mockup.jpg", kind: "full-scale model",
    caption: "Firefly Blue Ghost lander mockup (Space Symposium 2025)." },
  { id: "ch3", file: "Chandrayaan 3 Vikram lander stereo (53167467822) crop.png", kind: "on the Moon",
    caption: "Chandrayaan-3 Vikram lander on the Moon, imaged by the Pragyan rover (crop of a stereo image).",
    iconBox: { left: 95, top: 5, size: 150 } },
  { id: "slim", file: "SLIM half scale model (close cropped).png", kind: "scale model",
    caption: "Half-scale model of JAXA's SLIM lander in landing configuration." },
  { id: "ce4", file: "ChangE-4 - PCAM.png", kind: "on the Moon",
    caption: "Chang'e 4 lander on the lunar far side, imaged by the Yutu-2 rover." },
  { id: "ce5", file: "Chang'e-5 mockup at CSTM 02.jpg", kind: "full-scale model",
    caption: "Full-scale mockup of the Chang'e 5 lander and ascender." },
  { id: "ce6", file: "Chang'e-5 mockup at CSTM 03.jpg", kind: "full-scale model",
    caption: "Full-scale mockup of the Chang'e 5 lander; Chang'e 6 was built to the same design as its backup." },
];

const ALLOWED = [/^public domain$/i, /^cc0/i, /^cc by(-sa)? \d/i, /^godl-india$/i];
const API = "https://commons.wikimedia.org/w/api.php";
const UA = { "User-Agent": "lunar-site-app-assets/1.0 (student project; open-licence images only)" };
const strip = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: UA });
    const t = await r.text();
    if (r.ok && t.startsWith("{")) return JSON.parse(t);
    await sleep(4000 * (i + 1));
  }
  throw new Error(`Commons API failed: ${url}`);
}

const outDir = path.join(DATA_PUBLIC, "..", "images", "landers");
await mkdir(outDir, { recursive: true });
const records: Record<string, unknown> = {};
const cache = new Map<string, Buffer>();
const metaCache = new Map<string, Record<string, string>>();

for (const p of PICKS) {
  let meta = metaCache.get(p.file);
  if (!meta) {
    await sleep(1500);
    const j = await getJson(`${API}?action=query&format=json&titles=${encodeURIComponent("File:" + p.file)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1000`);
    const page = Object.values(j.query.pages)[0] as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const ii = page?.imageinfo?.[0];
    if (!ii) throw new Error(`${p.id}: file not found on Commons: ${p.file}`);
    const m = ii.extmetadata ?? {};
    meta = {
      license: strip(m.LicenseShortName?.value),
      licenseUrl: strip(m.LicenseUrl?.value),
      artist: strip(m.Artist?.value),
      credit: strip(m.Credit?.value),
      url: ii.thumburl ?? ii.url,
      page: ii.descriptionurl,
    };
    metaCache.set(p.file, meta);
  }
  if (!ALLOWED.some((re) => re.test(meta!.license))) throw new Error(`${p.id}: licence not allowed: ${meta.license}`);

  let buf = cache.get(meta.url);
  if (!buf) {
    await sleep(1500);
    const r = await fetch(meta.url, { headers: UA });
    if (!r.ok) throw new Error(`${p.id}: download failed ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
    cache.set(meta.url, buf);
  }
  const card = await sharp(buf).resize(480, 270, { fit: "cover", position: "attention" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  await writeFile(path.join(outDir, `${p.id}.jpg`), card);
  const icon = p.iconBox
    ? sharp(card).extract({ left: p.iconBox.left, top: p.iconBox.top, width: p.iconBox.size, height: p.iconBox.size }).resize(96, 96)
    : sharp(buf).resize(96, 96, { fit: "cover", position: "attention" });
  await icon.jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, `${p.id}-icon.jpg`));

  const shareAlike = /sa/i.test(meta.license);
  records[p.id] = {
    image: `/images/landers/${p.id}.jpg`,
    icon: `/images/landers/${p.id}-icon.jpg`,
    kind: p.kind,
    caption: p.caption,
    author: meta.artist || "see source page",
    license: meta.license,
    licenseUrl: meta.licenseUrl || null,
    sourcePage: meta.page,
    changes: `Resized and cropped by team VNI${shareAlike ? "; this derivative is shared under the same licence" : ""}.`,
  };
  log(`${p.id}: ${meta.license} - ${p.file}`);
}

await writeFile(
  path.join(DATA_PUBLIC, "site-images.json"),
  JSON.stringify(
    {
      note: "Illustrative photos of each lander, from Wikimedia Commons, used under the listed open licences (verified at download time). 'kind' says whether the photo shows the lander on the Moon, before launch, or a model.",
      generated: new Date().toISOString(),
      images: records,
    },
    null,
    2,
  ),
);
log(`wrote ${Object.keys(records).length} entries`);

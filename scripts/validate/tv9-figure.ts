/** Build the TV-9 side-by-side figure: the IM-1 terrain-horizon mask (same
 *  data the app draws) next to the LROC QuickMap view of the site's
 *  surroundings. Usage: npx tsx scripts/validate/tv9-figure.ts */
import sharp from "sharp";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { ROOT } from "../lib/common";

const FIG = path.join(ROOT, "docs", "validation", "figures");

const mask = JSON.parse(await readFile(path.join(ROOT, "public/data/horizon/im1.json"), "utf8"));
const W = 700, H = 360, L = 46, R = 10, T = 40, B = 34;
const elMax = 13, elMin = -2;
const x = (az: number) => L + (az / 360) * (W - L - R);
const y = (el: number) => T + ((elMax - el) / (elMax - elMin)) * (H - T - B);
let d = "";
for (let k = 0; k <= 3600; k += 2) {
  d += `${k ? "L" : "M"}${x((k % 3600) * 0.1).toFixed(1)},${y(mask.horizonElDeg[k % 3600]).toFixed(1)}`;
}
d += `L${W - R},${H - B}L${L},${H - B}Z`;
const grid = [0, 5, 10].map((g) =>
  `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="${g === 0 ? "#8a94ad" : "#2a3146"}" stroke-width="1" ${g === 0 ? 'stroke-dasharray="6 4"' : ""}/><text x="6" y="${y(g) + 4}" font-size="13" fill="#9aa3b5" font-family="Arial">${g}&#176;</text>`,
).join("");
const compass = [["N", 0], ["E", 90], ["S", 180], ["W", 270], ["N", 360]].map(
  ([t, a]) => `<text x="${x(a as number)}" y="${H - 12}" font-size="14" fill="#c8cede" text-anchor="middle" font-family="Arial">${t}</text>`,
).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0a101e"/>
<text x="${L}" y="24" font-size="15" fill="#e8ecf4" font-family="Arial">IM-1 terrain horizon (LOLA DEM mask, app data): high NE&#8211;S skyline, peak 11.1&#176; at az 149&#176; (SE)</text>
${grid}<path d="${d}" fill="rgba(90,100,130,0.65)" stroke="#aab4cf" stroke-width="1.5"/>${compass}</svg>`;
const left = await sharp(Buffer.from(svg)).png().toBuffer();

const qm = sharp(path.join(FIG, "tv9-im1-quickmap.png")).resize({ height: H });
const qmMeta = await qm.toBuffer({ resolveWithObject: true });
const title = `<svg xmlns="http://www.w3.org/2000/svg" width="${qmMeta.info.width}" height="28"><rect width="100%" height="100%" fill="#0a101e"/><text x="10" y="19" font-size="14" fill="#e8ecf4" font-family="Arial">LROC QuickMap, same site (dot = IM-1; north up, east right): massifs E&#8211;SE, smoother W</text></svg>`;
const right = await sharp({ create: { width: qmMeta.info.width, height: H, channels: 3, background: "#0a101e" } })
  .composite([
    { input: await sharp(Buffer.from(title)).png().toBuffer(), top: 0, left: 0 },
    { input: qmMeta.data, top: 28, left: 0 },
  ]).png().toBuffer();

const gap = 14;
await sharp({ create: { width: W + gap + qmMeta.info.width, height: H + 28, channels: 3, background: "#05070d" } })
  .composite([{ input: left, top: 14, left: 0 }, { input: right, top: 0, left: W + gap }])
  .png().toFile(path.join(FIG, "tv9-im1-pair.png"));
console.log("wrote", path.join(FIG, "tv9-im1-pair.png"));

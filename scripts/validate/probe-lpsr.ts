/** One-off probe used to choose the TV-7 PSR check point: reads the published
 *  LPSR (likely permanently shadowed region) layer at candidate points. */
import { CogReader, httpSource } from "../lib/bigtiff";
import { southStereo } from "../../src/lib/coords";
const url = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ.TIF";
const r = await CogReader.open(httpSource(url));
const { width, height, bitsPerSample, sampleFormat, pixelScale, tiepoint, predictor, compression } = r.info;
console.log("info", JSON.stringify({ width, height, bitsPerSample, sampleFormat, pixelScale, tiepoint, predictor, compression }));
const px = pixelScale[0], X0 = tiepoint[0], Y0 = tiepoint[1];
async function at(lat: number, lon: number, label: string) {
  const { x, y } = southStereo(lat, lon);
  const col = Math.round((x - X0) / px - 0.5), row = Math.round((Y0 - y) / px - 0.5);
  const v = await r.pixel(col, row);
  console.log(`${label}: lat ${lat} lon ${lon} -> val ${v}`);
}
await at(-89.66, 129.2, "Shackleton interior candidate");
await at(-89.66, 100.0, "Shackleton interior W");
await at(-89.7, 129.2, "Shackleton deeper S");
await at(-89.3, 129.2, "outside crater");
await at(-84.7906, 29.1957, "IM-2 (expect not PSR)");

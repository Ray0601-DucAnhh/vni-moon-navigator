/** WCAG 2.x contrast check for the design-token pairs actually used in the
 *  UI (A-01 / V-6). Alpha panels are composited over the page background.
 *  Usage: npx tsx scripts/validate/contrast-check.ts */

function srgb(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function lum([r, g, b]: number[]): number {
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function ratio(fg: number[], bg: number[]): number {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
function hex(h: string): number[] {
  const m = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
}
function over(fg: number[], alpha: number, bg: number[]): number[] {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}

const BG = hex("05070d");
const PANEL = over(hex("0d121e"), 0.94, BG); // --panel over --bg
const RAISED = hex("0b101c");

const checks: [string, number[], number[], number, string][] = [
  // [name, fg, bg, required, usage]
  ["text on panel", hex("e8ecf4"), PANEL, 4.5, "body text"],
  ["text on bg", hex("e8ecf4"), BG, 4.5, "top bar, time bar"],
  ["muted on panel", hex("9aa3b5"), PANEL, 4.5, "notes, labels"],
  ["muted on bg", hex("9aa3b5"), BG, 4.5, "subtitles"],
  ["faint on panel", hex("808a9e"), PANEL, 4.5, "tertiary hints (small text)"],
  ["sun accent on panel", hex("f5a623"), PANEL, 3.0, "badges/labels (large-ish, bold-ish)"],
  ["earth accent on panel", hex("4fa3ff"), PANEL, 3.0, "badges/links"],
  ["ok green on panel", hex("39d98a"), PANEL, 3.0, "status badge"],
  ["danger on panel", hex("ff6b6b"), PANEL, 4.5, "error text"],
  ["warn on panel", hex("ffb020"), PANEL, 4.5, "caution notes"],
  ["btn text on btn bg", hex("e8ecf4"), over(hex("8296be"), 0.12, PANEL), 4.5, "buttons"],
  ["primary btn text", hex("0b0e18"), hex("8b7cf7"), 4.5, "primary buttons"],
  ["focus ring vs panel", hex("9ec1ff"), PANEL, 3.0, "focus indicator"],
  ["marker clps vs bg", hex("8b7cf7"), BG, 3.0, "markers/legend"],
  ["mono values on panel", hex("e8ecf4"), RAISED, 4.5, "inputs"],
];

let fails = 0;
for (const [name, fg, bg, req, usage] of checks) {
  const r = ratio(fg, bg);
  const ok = r >= req;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(24)} ${r.toFixed(2)}:1 (need ${req}) - ${usage}`);
}
console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
process.exit(fails === 0 ? 0 : 2);

/** Shared pipeline configuration and small utilities. */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_PUBLIC = path.join(ROOT, "public", "data");
export const DATA_RAW = path.join(ROOT, "data-raw");
export const DEM_CACHE = path.join(DATA_RAW, "dem-cache");

export const PGDA_BASE = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp";
export const DEM_FILES = {
  m20: "LDEM_80S_20MPP_ADJ.TIF", // remote windows only (2.7 GB)
  m80: "LDEM_80S_80MPP_ADJ.TIF", // cached locally in full
  m240: "LDEM_60S_240MPP_ADJ.TIF", // cached locally in full
  effres20: "LDEM_80S_20MPP_ADJ_EFFRES.TIF",
  lpsr20: "LPSR_80S_20MPP_ADJ.TIF",
};

/** Extents (metres) of the stereographic grids, from the parsed headers. */
export const BOX_80S = 304_000; // |x|,|y| <= 304 km
export const BOX_60S = 931_200;

/** Ephemeris window (UTC). */
export const EPH_START = "2026-11-01T00:00:00Z";
export const EPH_STOP = "2027-11-01T00:00:00Z"; // exclusive-ish; last sample 2027-10-31T23:30
export const EPH_STEP_MIN = 30;
export const GEO_STEP_MIN = 60;

/** Horizon-mask parameters (plan v1.1 §4.2; sensitivity: TV-5/TV-6). */
export const AZ_STEP_DEG = 0.1;
export const OBSERVER_HEIGHT_M = 2.0;
export const MAX_RANGE_M = 300_000;
export const NEAR_RANGE_M = 20_000; // 20 m DEM zone
export const NEAR_STEP_M = 10;
export const FAR_STEP_M = 40;
export const WINDOW_HALF_M = 25_000; // 20 m window half-size fetched around site

export function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function sha256File(p: string): Promise<string> {
  return sha256(await readFile(p));
}

export async function writeJson(p: string, obj: unknown): Promise<void> {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj));
}

export async function writeJsonPretty(p: string, obj: unknown): Promise<void> {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2));
}

export async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

export interface ManifestEntry {
  kind: string;
  file: string;
  source?: string;
  retrieved?: string;
  sha256?: string;
  note?: string;
  [k: string]: unknown;
}

const MANIFEST_PATH = path.join(DATA_PUBLIC, "manifest.json");

export async function updateManifest(entries: ManifestEntry[]): Promise<void> {
  let m: { generated: string; entries: ManifestEntry[] } = {
    generated: new Date().toISOString(),
    entries: [],
  };
  if (existsSync(MANIFEST_PATH)) m = await readJson(MANIFEST_PATH);
  for (const e of entries) {
    m.entries = m.entries.filter((x) => !(x.kind === e.kind && x.file === e.file));
    m.entries.push(e);
  }
  m.generated = new Date().toISOString();
  m.entries.sort((a, b) => (a.kind + a.file).localeCompare(b.kind + b.file));
  await writeJsonPretty(MANIFEST_PATH, m);
}

export function round(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

export function log(msg: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

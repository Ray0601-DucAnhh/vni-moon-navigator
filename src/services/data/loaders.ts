/** Data loading with an in-memory cache. All app data is static JSON under
 *  /data; the deployed app makes no other network requests (except the
 *  user-initiated AI provider call). */

import type {
  HorizonMask, MoonGeocentric, RegionEntry, Site, SiteBundle, SiteDerived,
  SiteEphemeris, SourceRecord,
} from "../../types";

const cache = new Map<string, unknown>();

async function getJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  // Dev/preview servers answer missing files with the SPA's index.html (200).
  if (!(res.headers.get("content-type") ?? "").includes("json")) {
    throw new Error(`data file missing: ${url}`);
  }
  const data = (await res.json()) as T;
  cache.set(url, data);
  return data;
}

export interface SitesDoc {
  frame: string;
  analysedNote: string;
  sites: Site[];
}

export const loadSites = () => getJson<SitesDoc>("/data/sites.json");
export const loadRegions = () =>
  getJson<{ note: string; statusAsOf: string; regions: RegionEntry[] }>("/data/regions.json");
export const loadSources = () => getJson<{ note: string; sources: SourceRecord[] }>("/data/sources.json");
export const loadGeocentric = () => getJson<MoonGeocentric>("/data/ephemeris/moon-geocentric.json");

export async function loadSiteBundle(site: Site): Promise<SiteBundle> {
  if (!site.analysed) throw new Error(`${site.id} is a context site without analysis data`);
  const [eph, mask, derived] = await Promise.all([
    getJson<SiteEphemeris>(`/data/ephemeris/${site.id}.json`),
    getJson<HorizonMask>(`/data/horizon/${site.id}.json`),
    getJson<SiteDerived>(`/data/derived/${site.id}.json`),
  ]);
  return { site, eph, mask, derived };
}

export async function getSourceById(id: string): Promise<SourceRecord | null> {
  const { sources } = await loadSources();
  return sources.find((s) => s.id === id) ?? null;
}

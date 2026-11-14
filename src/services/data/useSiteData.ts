/** React hook owning all loaded data: the site list, analysed-site bundles
 *  (ephemeris + horizon + derived) with their accessors, and the geocentric
 *  series for globe lighting. Exposes per-site load errors and retry. */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MoonGeocentric, Site, SiteBundle } from "../../types";
import { loadGeocentric, loadSiteBundle, loadSites } from "./loaders";
import { makeEphAccessor, type EphAccessor } from "../science/core";
import { lerpAzDeg } from "../science/core";
import { parseIsoUtc } from "../../lib/time";

export interface LoadedSite {
  bundle: SiteBundle;
  acc: EphAccessor;
}

export interface SiteData {
  phase: "loading" | "ready" | "error";
  error: string | null;
  sites: Site[];
  frameNote: string;
  loaded: Record<string, LoadedSite>;
  failed: Record<string, string>;
  geo: MoonGeocentric | null;
  subSolar(tMs: number): { lonE: number; lat: number };
  subEarth(tMs: number): { lonE: number; lat: number };
  retry(siteId: string): void;
}

function geoAt(geo: MoonGeocentric, lon: number[], lat: number[], tMs: number) {
  const start = parseIsoUtc(geo.startUtc);
  const x = (tMs - start) / (geo.stepS * 1000);
  const i = Math.min(geo.count - 2, Math.max(0, Math.floor(x)));
  const f = Math.min(1, Math.max(0, x - i));
  return { lonE: lerpAzDeg(lon[i], lon[i + 1], f), lat: lat[i] + (lat[i + 1] - lat[i]) * f };
}

export function useSiteData(): SiteData {
  const [phase, setPhase] = useState<SiteData["phase"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [frameNote, setFrameNote] = useState("");
  const [loaded, setLoaded] = useState<Record<string, LoadedSite>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [geo, setGeo] = useState<MoonGeocentric | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [doc, g] = await Promise.all([loadSites(), loadGeocentric()]);
        if (!alive) return;
        setSites(doc.sites);
        setFrameNote(doc.frame);
        setGeo(g);
        const results = await Promise.allSettled(
          doc.sites.filter((s) => s.analysed).map(async (s) => ({ s, b: await loadSiteBundle(s) })),
        );
        if (!alive) return;
        const ok: Record<string, LoadedSite> = {};
        const bad: Record<string, string> = {};
        results.forEach((r, i) => {
          const site = doc.sites.filter((s) => s.analysed)[i];
          if (r.status === "fulfilled") ok[site.id] = { bundle: r.value.b, acc: makeEphAccessor(r.value.b.eph) };
          else bad[site.id] = String(r.reason?.message ?? r.reason);
        });
        setLoaded(ok);
        setFailed(bad);
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [retryTick]);

  const retry = useCallback((_siteId: string) => setRetryTick((t) => t + 1), []);

  return useMemo<SiteData>(
    () => ({
      phase,
      error,
      sites,
      frameNote,
      loaded,
      failed,
      geo,
      subSolar: (t) => (geo ? geoAt(geo, geo.subSolarLonE, geo.subSolarLat, t) : { lonE: 0, lat: 0 }),
      subEarth: (t) => (geo ? geoAt(geo, geo.subEarthLonE, geo.subEarthLat, t) : { lonE: 0, lat: 0 }),
      retry,
    }),
    [phase, error, sites, frameNote, loaded, failed, geo, retry],
  );
}

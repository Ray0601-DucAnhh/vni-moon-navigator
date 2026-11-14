/** React hook owning all loaded data: the site list, analysed-site bundles
 *  (ephemeris + horizon + derived) loaded ON DEMAND (selected / compared /
 *  requested by the assistant), and the geocentric series for globe lighting.
 *  Exposes per-site load errors and retry. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MoonGeocentric, Site } from "../../types";
import { clearCachedSite, loadGeocentric, loadSiteBundle, loadSites } from "./loaders";
import { makeEphAccessor, lerpAzDeg, type EphAccessor } from "../science/core";
import type { SiteBundle } from "../../types";
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
  pending: Record<string, boolean>;
  geo: MoonGeocentric | null;
  subSolar(tMs: number): { lonE: number; lat: number };
  subEarth(tMs: number): { lonE: number; lat: number };
  /** Load (once) and return a site's bundle; rejects on failure. */
  ensure(siteId: string): Promise<LoadedSite>;
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
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [geo, setGeo] = useState<MoonGeocentric | null>(null);
  const inflight = useRef(new Map<string, Promise<LoadedSite>>());
  const loadedRef = useRef<Record<string, LoadedSite>>({});
  const sitesRef = useRef<Site[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [doc, g] = await Promise.all([loadSites(), loadGeocentric()]);
        if (!alive) return;
        sitesRef.current = doc.sites;
        setSites(doc.sites);
        setFrameNote(doc.frame);
        setGeo(g);
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
  }, []);

  const ensure = useCallback((siteId: string): Promise<LoadedSite> => {
    const have = loadedRef.current[siteId];
    if (have) return Promise.resolve(have);
    const running = inflight.current.get(siteId);
    if (running) return running;
    const site = sitesRef.current.find((s) => s.id === siteId);
    if (!site) return Promise.reject(new Error(`Unknown site ${siteId}`));
    setPending((p) => ({ ...p, [siteId]: true }));
    const job = loadSiteBundle(site)
      .then((bundle) => {
        const ls: LoadedSite = { bundle, acc: makeEphAccessor(bundle.eph) };
        loadedRef.current = { ...loadedRef.current, [siteId]: ls };
        setLoaded(loadedRef.current);
        setFailed((f) => {
          const n = { ...f };
          delete n[siteId];
          return n;
        });
        return ls;
      })
      .catch((e: Error) => {
        setFailed((f) => ({ ...f, [siteId]: e.message }));
        throw e;
      })
      .finally(() => {
        inflight.current.delete(siteId);
        setPending((p) => {
          const n = { ...p };
          delete n[siteId];
          return n;
        });
      });
    inflight.current.set(siteId, job);
    return job;
  }, []);

  const retry = useCallback(
    (siteId: string) => {
      clearCachedSite(siteId);
      void ensure(siteId).catch(() => undefined);
    },
    [ensure],
  );

  return useMemo<SiteData>(
    () => ({
      phase,
      error,
      sites,
      frameNote,
      loaded,
      failed,
      pending,
      geo,
      subSolar: (t) => (geo ? geoAt(geo, geo.subSolarLonE, geo.subSolarLat, t) : { lonE: 0, lat: 0 }),
      subEarth: (t) => (geo ? geoAt(geo, geo.subEarthLonE, geo.subEarthLat, t) : { lonE: 0, lat: 0 }),
      ensure,
      retry,
    }),
    [phase, error, sites, frameNote, loaded, failed, pending, geo, ensure, retry],
  );
}

/** Memoised per-site computed state at the selected time. */

import { useMemo } from "react";
import { useApp } from "../../store/appStore";
import type { LoadedSite } from "../../services/data/useSiteData";
import {
  derivedNextEvents, getSiteState, windowStats,
} from "../../services/science/core";
import { parseIsoUtc } from "../../lib/time";
import type { SiteEvent, SiteState, WindowStats } from "../../types";

export interface SiteNow {
  state: SiteState;
  nextSun: SiteEvent | null;
  nextEarth: SiteEvent | null;
  sunCountdownMs: number | null;
  earthCountdownMs: number | null;
}

export function useSiteNow(ls: LoadedSite | null): SiteNow | null {
  const utcMs = useApp((s) => s.utcMs);
  return useMemo(() => {
    if (!ls) return null;
    const state = getSiteState(ls.acc, ls.bundle.mask, utcMs);
    const { sun, earth } = derivedNextEvents(ls.bundle.derived, utcMs);
    return {
      state,
      nextSun: sun,
      nextEarth: earth,
      sunCountdownMs: sun ? parseIsoUtc(sun.utc) - utcMs : null,
      earthCountdownMs: earth ? parseIsoUtc(earth.utc) - utcMs : null,
    };
  }, [ls, utcMs]);
}

export function useWindow30(ls: LoadedSite | null): WindowStats | null {
  const utcMs = useApp((s) => s.utcMs);
  // Recompute only when time moves by >= 30 min (stats barely change faster).
  const bucket = Math.floor(utcMs / (30 * 60_000));
  return useMemo(() => {
    if (!ls) return null;
    return windowStats(ls.acc, ls.bundle.mask, bucket * 30 * 60_000, 30);
  }, [ls, bucket]);
}

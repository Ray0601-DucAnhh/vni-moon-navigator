/** Shared data contracts. All angles in degrees unless suffixed otherwise.
 *  Coordinates: planetocentric latitude/longitude, mean Earth/polar axis frame
 *  (MOON_ME; DE421-aligned realisation), longitude east-positive in -180..180.
 *  Heights in metres relative to the 1,737,400 m reference sphere. Times UTC. */

export type SiteCategory =
  | "Landed - historic crewed"
  | "Landed - CLPS"
  | "Landed - other national program";

export interface Site {
  id: string;
  name: string;
  shortName: string;
  category: SiteCategory;
  mission: string;
  agency: string;
  latDeg: number;
  lonDeg: number;
  /** Elevation published by the coordinate source (m), if any. */
  publishedElevM: number | null;
  /** Reference for publishedElevM, as stated by the source. */
  publishedElevRef: string | null;
  landingDateUtc: string | null;
  statusNote: string;
  statusAsOf: string;
  /** True only for sites with terrain-aware analysis in this build. */
  analysed: boolean;
  sourceIds: string[];
  notes: string[];
}

export interface RegionEntry {
  name: string;
  category: string;
  mission: string;
  sourceIds: string[];
  statusNote: string;
}

export interface SourceRecord {
  id: string;
  title: string;
  org: string;
  url: string;
  note: string;
}

export interface SiteEphemeris {
  siteId: string;
  startUtc: string; // ISO, first sample instant
  stepS: number; // sample spacing, seconds
  count: number;
  /** Topocentric apparent azimuth (deg, clockwise from local north) and
   *  elevation (deg, relative to the local horizontal plane of the reference
   *  sphere; airless). Source: JPL Horizons, DE441, MEAN_ME frame. */
  sunAz: number[];
  sunEl: number[];
  earthAz: number[];
  earthEl: number[];
}

export interface MoonGeocentric {
  startUtc: string;
  stepS: number;
  count: number;
  subSolarLonE: number[]; // deg east
  subSolarLat: number[];
  subEarthLonE: number[];
  subEarthLat: number[];
}

export interface HorizonMask {
  siteId: string;
  azStepDeg: number; // 0.1
  /** Terrain horizon elevation per azimuth bin (deg). Bin k covers azimuth k*azStepDeg. */
  horizonElDeg: number[];
  /** Distance (km) to the terrain sample that forms the horizon in each bin. */
  horizonDistKm: number[];
  observerHeightM: number; // height of evaluated point above local terrain
  demHeightM: number; // DEM surface height at the site (m, vs 1737.4 km sphere)
  /** Elevation of the horizon if the Moon were locally smooth (observer
   *  observerHeightM above a sphere through the site): -acos((R+h)/(R+h+obs)). */
  smoothRefDeg: number;
  demFiles: string[];
  effectiveResM: number | null;
  maxRangeKm: number;
  nanSamples: number;
  generated: string;
  /** Which LOLA product family produced the mask. */
  terrainFamily?: "polar80" | "polar60" | "sldem";
  /** Human-readable resolution summary for this site. */
  resolutionNote?: string;
  /** TV-5: horizon change when the near-field DEM is coarsened ~4x (RMS / max, deg). */
  resolutionSensitivity?: { rmsDeg: number; maxDeg: number; comparedWith: string };
}

export interface SiteEvent {
  type: "rise" | "set";
  utc: string;
}

export interface SiteDerived {
  siteId: string;
  windowStartUtc: string;
  windowEndUtc: string;
  /** Terrain-aware events: Sun events are crossings of "centre of solar disc
   *  above terrain horizon" (visible fraction 0.5); Earth events are crossings
   *  of "Earth centre above terrain horizon" (geometric line of sight only). */
  sunEvents: SiteEvent[];
  earthEvents: SiteEvent[];
  /** Per-UTC-day fraction of time in each state (10-minute sampling). */
  dailyDates: string[]; // YYYY-MM-DD
  dailySunlitFrac: number[];
  dailyEarthFrac: number[];
}

export interface BodyState {
  azDeg: number;
  elDeg: number;
  horizonElDeg: number;
  /** elDeg - horizonElDeg */
  clearanceDeg: number;
}

export interface SiteState {
  utc: string;
  inRange: boolean;
  sun: BodyState & {
    /** Fraction of the solar disc above the terrain horizon (0..1). */
    visibleFraction: number;
    /** Terrain-aware: disc centre above terrain horizon (fraction >= 0.5). */
    sunlit: boolean;
    /** Smooth-Moon reference: elevation > 0 deg (no terrain). */
    smoothSunlit: boolean;
  };
  earth: BodyState & {
    /** Terrain-aware geometric line of sight to the Earth centre. NOT a radio link. */
    visible: boolean;
    smoothVisible: boolean;
  };
}

export interface WindowStats {
  startUtc: string;
  days: number;
  sunlitFrac: number;
  earthFrac: number;
  bothFrac: number;
  smoothSunlitFrac: number;
  smoothEarthFrac: number;
  longestDarkH: number;
}

export interface SiteBundle {
  site: Site;
  eph: SiteEphemeris;
  mask: HorizonMask;
  derived: SiteDerived;
}

/** Illustrative lander photo (public/data/site-images.json). */
export interface SiteImage {
  image: string;
  icon: string;
  kind: string;
  caption: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  sourcePage: string;
  changes: string;
}

/** Read-only, deterministic tools the assistant may call. Every numeric
 *  claim in an answer must come from these results (enforced by the number
 *  guard). They reuse exactly the functions the UI renders from. */

import type { LoadedSite } from "../data/useSiteData";
import type { RegionEntry, Site, SourceRecord } from "../../types";
import {
  derivedNextEvents, getSiteState, windowStats,
} from "../science/core";
import { EPH_WINDOW } from "../data/window";
import { GLOSSARY, LIMITATIONS, METHOD_SUMMARY } from "../../content/text";
import { parseIsoUtc, toIsoUtc } from "../../lib/time";

export interface ToolContext {
  sites: Site[];
  regions: RegionEntry[];
  sources: SourceRecord[];
  loaded: Record<string, LoadedSite>;
  selectedSiteId: string | null;
  utcMs: number;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output: unknown;
}

type ToolFn = (input: Record<string, unknown>, ctx: ToolContext) => unknown;

function err(message: string): { error: string } {
  return { error: message };
}

function resolveSite(ctx: ToolContext, siteId: unknown): { site: Site; ls: LoadedSite } | { error: string } {
  const id = String(siteId ?? ctx.selectedSiteId ?? "");
  const site = ctx.sites.find((s) => s.id === id);
  if (!site) return err(`Unknown site_id "${id}". Analysed sites: im2, im1. Use list_sites.`);
  if (!site.analysed) {
    return err(
      `${site.name} is a context site: this build has no terrain or Sun/Earth analysis for it. Analysed sites: im2 (IM-2 Athena), im1 (IM-1 Odysseus).`,
    );
  }
  const ls = ctx.loaded[id];
  if (!ls) return err(`Data for ${id} failed to load in this session.`);
  return { site, ls };
}

function resolveTime(ctx: ToolContext, utc: unknown): number | { error: string } {
  if (utc === undefined || utc === null || utc === "") return ctx.utcMs;
  const t = Date.parse(String(utc));
  if (!Number.isFinite(t)) return err(`Could not parse utc "${utc}". Use ISO like 2027-01-15T12:00Z.`);
  if (t < EPH_WINDOW.startMs || t > EPH_WINDOW.endMs) {
    return err(`Requested time is outside this app's data window (${EPH_WINDOW.startLabel} to ${EPH_WINDOW.endLabel} UTC). Not available.`);
  }
  return t;
}

const toolFns: Record<string, ToolFn> = {
  list_sites(_input, ctx) {
    return {
      analysed: ctx.sites.filter((s) => s.analysed).map((s) => ({
        site_id: s.id, name: s.name, category: s.category, latDeg: s.latDeg, lonDeg: s.lonDeg,
        statusNote: s.statusNote, statusAsOf: s.statusAsOf, sourceIds: s.sourceIds,
      })),
      contextOnly: ctx.sites.filter((s) => !s.analysed).map((s) => ({ site_id: s.id, name: s.name, category: s.category })),
      regionsWithoutCoordinates: ctx.regions.map((r) => ({ name: r.name, mission: r.mission, sourceIds: r.sourceIds })),
      dataWindowUtc: `${EPH_WINDOW.startLabel} to ${EPH_WINDOW.endLabel}`,
    };
  },

  get_site_summary(input, ctx) {
    const r = resolveSite(ctx, input.site_id);
    if ("error" in r) return r;
    const t = resolveTime(ctx, input.utc);
    if (typeof t !== "number") return t;
    const state = getSiteState(r.ls.acc, r.ls.bundle.mask, t);
    const next = derivedNextEvents(r.ls.bundle.derived, t);
    const w30 = windowStats(r.ls.acc, r.ls.bundle.mask, t, 30);
    const mask = r.ls.bundle.mask;
    return {
      site: {
        site_id: r.site.id, name: r.site.name, mission: r.site.mission, agency: r.site.agency,
        latDeg: r.site.latDeg, lonDeg: r.site.lonDeg, demHeightM: mask.demHeightM,
        publishedElevM: r.site.publishedElevM, sourceIds: r.site.sourceIds,
        statusNote: r.site.statusNote, statusAsOf: r.site.statusAsOf, notes: r.site.notes,
      },
      state,
      nextEvents: {
        sun: next.sun ? { ...next.sun, hoursFromNow: Math.round(((parseIsoUtc(next.sun.utc) - t) / 3.6e6) * 10) / 10 } : null,
        earth: next.earth ? { ...next.earth, hoursFromNow: Math.round(((parseIsoUtc(next.earth.utc) - t) / 3.6e6) * 10) / 10 } : null,
      },
      next30days: w30,
      terrain: {
        demFiles: mask.demFiles, effectiveResM: mask.effectiveResM, maxRangeKm: mask.maxRangeKm,
        observerHeightM: mask.observerHeightM,
        horizonElMinDeg: Math.min(...mask.horizonElDeg), horizonElMaxDeg: Math.max(...mask.horizonElDeg),
      },
      caveats: [
        "Earth 'visible' = geometric line of sight to the Earth centre only; NOT a communication link.",
        "Sunlit = solar-disc centre above the terrain horizon.",
        r.site.id === "im1" ? "IM-1 coordinates have ~300 m uncertainty; parts of its horizon shift by up to ~4.3 deg within that uncertainty." : null,
      ].filter(Boolean),
    };
  },

  compare_sites(input, ctx) {
    const ids = Array.isArray(input.site_ids) && input.site_ids.length >= 2 ? input.site_ids : ["im2", "im1"];
    const t = resolveTime(ctx, input.utc);
    if (typeof t !== "number") return t;
    const days = Math.min(90, Math.max(1, Number(input.window_days ?? 30)));
    const out: Record<string, unknown>[] = [];
    for (const id of ids.slice(0, 2)) {
      const r = resolveSite(ctx, id);
      if ("error" in r) return r;
      const state = getSiteState(r.ls.acc, r.ls.bundle.mask, t);
      out.push({ site_id: r.site.id, name: r.site.shortName, state, window: windowStats(r.ls.acc, r.ls.bundle.mask, t, days) });
    }
    return {
      utc: toIsoUtc(t, true),
      windowDays: days,
      sites: out,
      note: "Values are side-by-side facts, not a ranking. Earth visibility is geometric only.",
    };
  },

  get_windows(input, ctx) {
    const r = resolveSite(ctx, input.site_id);
    if ("error" in r) return r;
    const t0 = resolveTime(ctx, input.start_utc);
    if (typeof t0 !== "number") return t0;
    const t1raw = input.end_utc ? resolveTime(ctx, input.end_utc) : t0 + 30 * 86_400_000;
    if (typeof t1raw !== "number") return t1raw;
    const t1 = Math.min(t1raw, t0 + 120 * 86_400_000);
    const inRange = (u: string) => {
      const x = parseIsoUtc(u);
      return x >= t0 && x <= t1;
    };
    return {
      site_id: r.site.id,
      startUtc: toIsoUtc(t0, true),
      endUtc: toIsoUtc(t1, true),
      sunEvents: r.ls.bundle.derived.sunEvents.filter((e) => inRange(e.utc)),
      earthEvents: r.ls.bundle.derived.earthEvents.filter((e) => inRange(e.utc)),
      note: "rise/set = terrain-aware crossings (Sun-disc centre / Earth centre vs terrain horizon). Events shorter than 10 minutes can be missed.",
    };
  },

  get_method_notes(input, _ctx) {
    const topic = String(input.topic ?? "all");
    return {
      topic,
      methods: METHOD_SUMMARY,
      limitations: LIMITATIONS,
      glossary: GLOSSARY,
    };
  },

  get_sources(input, ctx) {
    const ids = Array.isArray(input.source_ids) ? (input.source_ids as string[]) : null;
    const list = ids ? ctx.sources.filter((s) => ids.includes(s.id)) : ctx.sources;
    return { sources: list };
  },
};

export const TOOL_DEFS = [
  {
    name: "list_sites",
    description:
      "List the sites in this app: analysed sites (terrain-aware Sun/Earth analysis), context-only sites, and officially named regions without published coordinates. Also returns the data window.",
    input_schema: { type: "object" as const, properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "get_site_summary",
    description:
      "Full computed summary for an analysed site at a UTC time: Sun/Earth azimuth-elevation, terrain horizon, sunlit & Earth-visibility states, next events, 30-day statistics, terrain provenance and caveats. Omit utc to use the app's selected time.",
    input_schema: {
      type: "object" as const,
      properties: {
        site_id: { type: "string", description: "im2 or im1; omit for the user's selected site" },
        utc: { type: "string", description: "ISO UTC like 2027-01-15T12:00Z; omit for the app's selected time" },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "compare_sites",
    description: "Compare two analysed sites at a shared time over a window (default both sites, 30 days).",
    input_schema: {
      type: "object" as const,
      properties: {
        site_ids: { type: "array", items: { type: "string" }, description: "default ['im2','im1']" },
        utc: { type: "string" },
        window_days: { type: "number" },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_windows",
    description: "Terrain-aware sunrise/sunset and Earthrise/Earthset events for a site between two UTC times (max 120 days).",
    input_schema: {
      type: "object" as const,
      properties: {
        site_id: { type: "string" },
        start_utc: { type: "string" },
        end_utc: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_method_notes",
    description: "The app's method summary, limitations and glossary - use when asked how something is computed or what a term means.",
    input_schema: {
      type: "object" as const,
      properties: { topic: { type: "string" } },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_sources",
    description: "Source records (id, title, organisation, URL) for citations; optionally filter by source_ids.",
    input_schema: {
      type: "object" as const,
      properties: { source_ids: { type: "array", items: { type: "string" } } },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
];

export function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): unknown {
  const fn = toolFns[name];
  if (!fn) return err(`Unknown tool ${name}`);
  try {
    return fn(input, ctx);
  } catch (e) {
    return err(`Tool ${name} failed: ${(e as Error).message}`);
  }
}

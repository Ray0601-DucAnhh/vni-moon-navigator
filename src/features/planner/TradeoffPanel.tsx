/** Level C - transparent multi-criteria view of all 14 sites:
 *  raw metrics, Pareto set (no weights needed), a score from the USER's own
 *  weights, and how often each site comes out on top across 2,000 random
 *  weightings. No "best site": the answer depends on the mission. */

import { useMemo, useState } from "react";
import type { LoadedSite } from "../../services/data/useSiteData";
import type { Site } from "../../types";
import { windowStats } from "../../services/science/core";
import {
  findOperationWindows, METRIC_KEYS, paretoFront, rankStability, weightedScores, type SiteMetrics,
} from "../../services/science/planning";

const LABEL: Record<string, string> = {
  sunlitFrac: "Sunlit (year)",
  earthFrac: "Earth in sight (year)",
  longestWindowH: "Longest Sun+Earth window",
  longestDarkH: "Longest dark spell",
  horizonRmsDeg: "Terrain uncertainty (RMS)",
};

function metricsFor(id: string, ls: LoadedSite): SiteMetrics {
  const { acc, bundle } = ls;
  const st = windowStats(acc, bundle.mask, acc.startMs, 366);
  const ws = findOperationWindows(acc, bundle.mask, acc.startMs, acc.endMs, { needSun: true, needEarth: true, minDurationH: 0 });
  return {
    id,
    sunlitFrac: st.sunlitFrac,
    earthFrac: st.earthFrac,
    longestWindowH: ws.reduce((m, w) => Math.max(m, w.durationH), 0),
    longestDarkH: st.longestDarkH,
    horizonRmsDeg: bundle.mask.resolutionSensitivity?.rmsDeg ?? 0,
  };
}

export function TradeoffPanel({ loaded, sites }: { loaded: Record<string, LoadedSite>; sites: Site[] }) {
  const [w, setW] = useState<Record<string, number>>(Object.fromEntries(METRIC_KEYS.map(({ k }) => [k, 1])));
  const [needEarth, setNeedEarth] = useState(true);
  const name = (id: string) => sites.find((s) => s.id === id)?.shortName ?? id;

  const all = useMemo(() => Object.entries(loaded).map(([id, ls]) => metricsFor(id, ls)), [loaded]);
  const ms = useMemo(() => (needEarth ? all.filter((m) => m.earthFrac > 0) : all), [all, needEarth]);
  const excluded = all.length - ms.length;
  const pareto = useMemo(() => new Set(ms.length ? paretoFront(ms) : []), [ms]);
  const scores = useMemo(() => (ms.length ? weightedScores(ms, w) : {}), [ms, w]);
  const stability = useMemo(() => (ms.length ? rankStability(ms) : {}), [ms]);
  const rows = [...ms].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));

  return (
    <section className="panel-section" aria-label="Trade-off explorer">
      <h3>All-site trade-offs (your weights)</h3>
      <label className="note" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={needEarth} onChange={(e) => setNeedEarth(e.target.checked)} />
        Earth in sight required (removes far-side sites before comparing){excluded ? ` - ${excluded} removed` : ""}
      </label>
      {METRIC_KEYS.map(({ k, higherBetter }) => (
        <label key={k} className="stat-row" style={{ alignItems: "center" }}>
          <span className="k">{LABEL[k]} <span style={{ color: "var(--text-faint)" }}>({higherBetter ? "higher" : "lower"} preferred)</span></span>
          <span className="v" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="range" min={0} max={5} step={1} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} aria-label={`Weight for ${LABEL[k]}`} />
            {w[k]}
          </span>
        </label>
      ))}
      <div className="wf-scroll" style={{ maxHeight: 320 }}>
        <table className="mini-table">
          <thead>
            <tr><th>Site</th><th>Score</th><th>Pareto</th><th>Top in</th><th>Sun</th><th>Earth</th><th>Window</th><th>Dark</th><th>RMS</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td style={{ fontFamily: "var(--font-ui)" }}>{name(m.id)}</td>
                <td>{(scores[m.id] ?? 0).toFixed(2)}</td>
                <td>{pareto.has(m.id) ? "yes" : "-"}</td>
                <td>{((stability[m.id] ?? 0) * 100).toFixed(0)}%</td>
                <td>{(m.sunlitFrac * 100).toFixed(1)}%</td>
                <td>{(m.earthFrac * 100).toFixed(1)}%</td>
                <td>{m.longestWindowH.toFixed(0)} h</td>
                <td>{m.longestDarkH.toFixed(0)} h</td>
                <td>{m.horizonRmsDeg.toFixed(3)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Score = weighted mean of min-max normalised metrics; it depends entirely on the weights you choose and is
        not a recommendation or a safety judgement. "Pareto = yes": no other site is at least as good on every
        criterion. "Top in" = share of 2,000 random weightings (Dirichlet, seed 42) in which the site scores highest.
        Year = 2026-11-01 → 2027-11-01. Earth in sight is geometric line of sight only, not a radio link.
      </p>
    </section>
  );
}

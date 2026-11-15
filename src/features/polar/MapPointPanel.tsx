/** Terrain-aware analysis of a point picked on the south-polar map (or sent
 *  from Custom point): the nearest Level B-grid node's terrain horizon,
 *  with Sun/Earth from skyAt, so every existing tool (state, countdowns,
 *  panorama, operation windows) works on it unchanged. */

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../store/appStore";
import type { MoonGeocentric, SourceRecord } from "../../types";
import type { LoadedSite } from "../../services/data/useSiteData";
import { loadPolarPoint, type PolarPoint } from "../../services/data/polar";
import { makeCustomPoint } from "../../services/science/customPoint";
import { earthClearance, findCrossings, getSiteState, sunClearance, windowStats } from "../../services/science/core";
import { HorizonPanorama } from "../horizon/HorizonPanorama";
import { WindowFinder } from "../planner/WindowFinder";
import { azCompass, fmtDeg, fmtHours, fmtLatLon, fmtMeters, fmtPct } from "../../lib/format";
import { fmtDuration, parseIsoUtc } from "../../lib/time";
import { DTE_DISCLAIMER } from "../../content/text";

const SOURCE_IDS = ["S34", "S50", "S21"];

export function MapPointPanel({ geo, sources }: { geo: MoonGeocentric | null; sources: SourceRecord[] }) {
  const mapPoint = useApp((s) => s.mapPoint);
  const setPanel = useApp((s) => s.setPanel);
  const utcMs = useApp((s) => s.utcMs);
  const [pp, setPp] = useState<PolarPoint | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "outside" | "error">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!mapPoint) return;
    let alive = true;
    setStatus("loading");
    loadPolarPoint(mapPoint.latDeg, mapPoint.lonDeg)
      .then((p) => {
        if (!alive) return;
        setPp(p);
        setStatus(p ? "ready" : "outside");
      })
      .catch((e: Error) => {
        if (!alive) return;
        setErr(e.message);
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [mapPoint]);

  const model = useMemo(() => (geo && pp ? makeCustomPoint(geo, pp.node.latDeg, pp.node.lonDeg) : null), [geo, pp]);
  const ls = useMemo(
    () => (model && pp ? ({ acc: model.acc, bundle: { mask: pp.mask } } as unknown as LoadedSite) : null),
    [model, pp],
  );
  const state = ls && pp ? getSiteState(ls.acc, pp.mask, utcMs) : null;
  const next = useMemo(() => {
    if (!ls || !pp) return null;
    const t1 = Math.min(ls.acc.endMs, utcMs + 40 * 86_400_000);
    if (utcMs < ls.acc.startMs || utcMs >= t1) return null;
    const sun = findCrossings((t) => sunClearance(ls.acc, pp.mask, t), utcMs, t1, 600_000, 30_000)[0] ?? null;
    const earth = findCrossings((t) => earthClearance(ls.acc, pp.mask, t), utcMs, t1, 600_000, 30_000)[0] ?? null;
    return { sun, earth };
  }, [ls, pp, utcMs]);
  const bucket = Math.floor(utcMs / (30 * 60_000));
  const w30 = useMemo(() => (ls && pp ? windowStats(ls.acc, pp.mask, bucket * 30 * 60_000, 30) : null), [ls, pp, bucket]);
  const panelSources = sources.filter((s) => SOURCE_IDS.includes(s.id));

  if (!mapPoint) return null;
  const s = pp?.stats;

  return (
    <aside
      className="right-panel"
      aria-label="Map point analysis"
      data-node-idx={pp?.node.idx}
      data-sun-halfpct={s ? Math.round(s.sunlitFrac * 200) : undefined}
      data-earth-halfpct={s ? Math.round(s.earthFrac * 200) : undefined}
    >
      <header>
        <h2>
          Map point
          <small className="panel-sub">{fmtLatLon(mapPoint.latDeg, mapPoint.lonDeg)}</small>
        </h2>
        <button className="close-x" aria-label="Close panel" onClick={() => setPanel("none")}>&#10005;</button>
      </header>
      <div className="panel-body">
        <span className="badge">Level B-grid · LOLA 80 m terrain · 2 km grid</span>
        {status === "loading" && <p className="note">Loading terrain for this point…</p>}
        {status === "outside" && <p className="note caution">This point is outside the south-polar map (80°S to the pole). Use Custom point for a flat-horizon baseline.</p>}
        {status === "error" && <p className="note caution">Could not load the map data: {err}</p>}

        {pp && s && (
          <>
            <section className="panel-section">
              <h3>Location</h3>
              <div className="stat-row"><span className="k">Grid node used</span><span className="v">{fmtLatLon(pp.node.latDeg, pp.node.lonDeg)}</span></div>
              <div className="stat-row"><span className="k">Distance from your point</span><span className="v">{(pp.node.distM / 1000).toFixed(2)} km</span></div>
              <div className="stat-row"><span className="k">DEM surface height</span><span className="v">{fmtMeters(s.demHeightM)} (vs 1737.4 km sphere)</span></div>
              <p className="note">The nearest node's horizon is used as is - horizons are not blended between nodes 2 km apart, because that would not be physical.</p>
            </section>

            <section className="panel-section">
              <h3>Data year at this node</h3>
              <div className="cmp-grid" style={{ gridTemplateColumns: "1fr auto" }}>
                <span className="k">Sunlit</span><span className="v">{fmtPct(s.sunlitFrac)}</span>
                <span className="k">Earth in sight</span><span className="v">{fmtPct(s.earthFrac)}</span>
                <span className="k">Both at once</span><span className="v">{fmtPct(s.bothFrac)}</span>
                <span className="k">Longest dark spell</span><span className="v">{fmtHours(s.longestDarkH)}</span>
              </div>
              <p className="note">2026-11-01 → 2027-11-01, hourly - the same numbers the map colours show.</p>
            </section>

            {state && (
              <section className="panel-section">
                <h3>Sky at the selected time</h3>
                <div className="stat-row">
                  <span className="k">Sun</span>
                  <span className="v">az {fmtDeg(state.sun.azDeg, 1)} ({azCompass(state.sun.azDeg)}) · el {fmtDeg(state.sun.elDeg, 2)} · {state.sun.sunlit ? "above terrain" : "behind terrain"}</span>
                </div>
                <div className="stat-row">
                  <span className="k">Earth</span>
                  <span className="v">az {fmtDeg(state.earth.azDeg, 1)} ({azCompass(state.earth.azDeg)}) · el {fmtDeg(state.earth.elDeg, 2)} · {state.earth.visible ? "in sight" : "behind terrain"}</span>
                </div>
                <HorizonPanorama mask={pp.mask} state={state} />
              </section>
            )}

            <section className="panel-section">
              <h3>Countdowns</h3>
              <div className="stat-row">
                <span className="k">Next {next?.sun?.type === "set" ? "sunset" : "sunrise"}</span>
                <span className="v">{next?.sun ? `${fmtDuration(parseIsoUtc(next.sun.utc) - utcMs)} (${next.sun.utc.slice(0, 16).replace("T", " ")} UTC)` : "none in the next 40 days"}</span>
              </div>
              <div className="stat-row">
                <span className="k">Next {next?.earth?.type === "set" ? "Earthset" : "Earthrise"}</span>
                <span className="v">{next?.earth ? `${fmtDuration(parseIsoUtc(next.earth.utc) - utcMs)} (${next.earth.utc.slice(0, 16).replace("T", " ")} UTC)` : "none in the next 40 days"}</span>
              </div>
            </section>

            {ls && <WindowFinder ls={ls} />}

            {w30 && (
              <section className="panel-section">
                <h3>Next 30 days (from selected time)</h3>
                <div className="cmp-grid">
                  <span className="h"></span><span className="h">Terrain-aware</span><span className="h">Smooth Moon</span>
                  <span className="k">Sunlit</span><span className="v">{fmtPct(w30.sunlitFrac)}</span><span className="v">{fmtPct(w30.smoothSunlitFrac)}</span>
                  <span className="k">Earth in sight</span><span className="v">{fmtPct(w30.earthFrac)}</span><span className="v">{fmtPct(w30.smoothEarthFrac)}</span>
                  <span className="k">Both at once</span><span className="v">{fmtPct(w30.bothFrac)}</span><span className="v">&#8212;</span>
                </div>
              </section>
            )}

            <section className="panel-section">
              <h3>Method &amp; limitations</h3>
              <p className="note caution" style={{ marginTop: 0 }}>{DTE_DISCLAIMER}</p>
              <p className="note">Terrain horizon from the LOLA 80 m south-polar DEM (240 m beyond the 80°S box), observer 2 m above the surface, 1° azimuth bins, rays to 300 km. Sun and Earth from JPL Horizons sub-solar/sub-Earth points.</p>
              <p className="note">Checked against the full 20 m analysis at IM-1 and IM-2: horizon within 0.12° RMS, yearly sunlit time within 0.4 percentage points (qa/reports/polar-validation.md).</p>
              <p className="note">This is a regional comparison. Small relief below ~100 m, boulders and slopes are not resolved, so it is not a landing-site safety assessment. The 14 analysed sites use finer terrain and remain the reference.</p>
            </section>

            <section className="panel-section">
              <h3>Sources</h3>
              {panelSources.map((src) => (
                <p key={src.id} className="note" style={{ margin: "0 0 5px" }}>
                  <span className="mono">{src.id}</span>{" "}
                  <a href={src.url} target="_blank" rel="noopener noreferrer">{src.title}</a> &#8212; {src.org}
                </p>
              ))}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

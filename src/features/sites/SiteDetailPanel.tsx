/** Full site profile: location & provenance, sky panorama, countdowns,
 *  30-day statistics (terrain vs smooth), notes, method & limitations. */

import { useState } from "react";
import { useApp } from "../../store/appStore";
import type { Site, SourceRecord, SiteImage } from "../../types";
import type { LoadedSite } from "../../services/data/useSiteData";
import { useSiteNow, useWindow30 } from "./useSiteState";
import { HorizonPanorama } from "../horizon/HorizonPanorama";
import { fmtDeg, fmtHours, fmtLatLon, fmtMeters, fmtPct, azCompass } from "../../lib/format";
import { fmtDuration } from "../../lib/time";
import { DTE_DISCLAIMER, LIMITATIONS, METHOD_SUMMARY } from "../../content/text";

export function SiteDetailPanel({
  site,
  image,
  ls,
  sources,
}: {
  site: Site;
  image?: SiteImage;
  ls: LoadedSite | null;
  sources: SourceRecord[];
}) {
  const setPanel = useApp((s) => s.setPanel);
  const toggleCompare = useApp((s) => s.toggleCompare);
  const now = useSiteNow(ls);
  const w30 = useWindow30(ls);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const siteSources = sources.filter((s) => site.sourceIds.includes(s.id));
  const mask = ls?.bundle.mask ?? null;

  return (
    <aside className="right-panel" aria-label={`${site.name} details`}>
      <header>
        <h2>{site.name}</h2>
        <button className="close-x" aria-label="Close panel" onClick={() => setPanel("none")}>&#10005;</button>
      </header>
      <div className="panel-body">
        <div className="stat-row"><span className="k">Mission</span><span className="v" style={{ fontFamily: "var(--font-ui)" }}>{site.mission}</span></div>
        <div className="stat-row"><span className="k">Agency</span><span className="v" style={{ fontFamily: "var(--font-ui)" }}>{site.agency}</span></div>
        {site.landingDateUtc && (
          <div className="stat-row"><span className="k">Landing date</span><span className="v">{site.landingDateUtc}</span></div>
        )}
        <div className="stat-row"><span className="k">Status</span><span className="v" style={{ fontFamily: "var(--font-ui)", maxWidth: 240 }}>{site.statusNote} <em style={{ color: "var(--text-faint)" }}>(as of {site.statusAsOf})</em></span></div>

        {image && (
          <section className="panel-section detail-photo">
            <h3>Photo</h3>
            <img src={image.image} alt={image.caption} loading="lazy" width={480} height={270} />
            <p className="note" style={{ margin: "6px 0 0" }}>
              {image.caption} Photo: {image.author}.{" "}
              {image.licenseUrl ? <a href={image.licenseUrl} target="_blank" rel="noreferrer noopener">{image.license}</a> : image.license}
              {" · "}<a href={image.sourcePage} target="_blank" rel="noreferrer noopener">source</a>. {image.changes} Illustrative only - not used in any calculation.
            </p>
          </section>
        )}

        <section className="panel-section">
          <h3>Location</h3>
          <div className="stat-row"><span className="k">Coordinates</span><span className="v">{fmtLatLon(site.latDeg, site.lonDeg)}</span></div>
          {mask && <div className="stat-row"><span className="k">DEM surface height</span><span className="v">{fmtMeters(mask.demHeightM)} (vs 1737.4 km sphere)</span></div>}
          <div className="stat-row"><span className="k">Published elevation</span><span className="v">{site.publishedElevM !== null ? `${fmtMeters(site.publishedElevM)}` : "not published in source"}</span></div>
          {mask?.effectiveResM != null && (
            <div className="stat-row"><span className="k">DEM effective resolution here</span><span className="v">~{Math.round(mask.effectiveResM)} m</span></div>
          )}
          {mask?.resolutionNote && (
            <div className="stat-row">
              <span className="k">Terrain data</span>
              <span className="v" style={{ fontFamily: "var(--font-ui)", maxWidth: 230 }}>
                {mask.terrainFamily === "sldem" ? "SLDEM2015 (LOLA+SELENE): " : "LOLA south-polar DEMs: "}
                {mask.resolutionNote}
              </span>
            </div>
          )}
          {mask?.resolutionSensitivity && (
            <div className="stat-row">
              <span className="k">Resolution check</span>
              <span className="v" style={{ fontFamily: "var(--font-ui)", maxWidth: 230 }}>
                horizon changes by {mask.resolutionSensitivity.rmsDeg.toFixed(2)}&#176; RMS (max{" "}
                {mask.resolutionSensitivity.maxDeg.toFixed(2)}&#176;) with a ~4&#215; coarser near-field DEM
                {mask.resolutionSensitivity.rmsDeg > 0.2 ? " - small nearby relief matters here; treat window edges as ± about this" : ""}
              </span>
            </div>
          )}
        </section>

        {now && mask && (
          <>
            <section className="panel-section">
              <h3>Sky at the selected time</h3>
              <div className="stat-row">
                <span className="k">Sun</span>
                <span className="v">az {fmtDeg(now.state.sun.azDeg, 1)} ({azCompass(now.state.sun.azDeg)}) &#183; el {fmtDeg(now.state.sun.elDeg, 2)}</span>
              </div>
              <div className="stat-row">
                <span className="k">Earth</span>
                <span className="v">az {fmtDeg(now.state.earth.azDeg, 1)} ({azCompass(now.state.earth.azDeg)}) &#183; el {fmtDeg(now.state.earth.elDeg, 2)}</span>
              </div>
              <HorizonPanorama mask={mask} state={now.state} />
            </section>

            <section className="panel-section">
              <h3>Countdowns</h3>
              <div className="stat-row">
                <span className="k">Next {now.nextSun?.type === "set" ? "sunset" : "sunrise"}</span>
                <span className="v">{now.sunCountdownMs !== null ? `${fmtDuration(now.sunCountdownMs)} (${now.nextSun!.utc.slice(0, 16).replace("T", " ")} UTC)` : "none before window end"}</span>
              </div>
              <div className="stat-row">
                <span className="k">Next {now.nextEarth?.type === "set" ? "Earthset" : "Earthrise"}</span>
                <span className="v">{now.earthCountdownMs !== null ? `${fmtDuration(now.earthCountdownMs)} (${now.nextEarth!.utc.slice(0, 16).replace("T", " ")} UTC)` : "none in data window"}</span>
              </div>
              <p className="note">Terrain-aware: Sun events = disc centre crossing the terrain horizon; Earth events = Earth centre crossing it (geometric only).</p>
            </section>

            {w30 && (
              <section className="panel-section">
                <h3>Next 30 days (from selected time)</h3>
                <div className="cmp-grid">
                  <span className="h"></span><span className="h">Terrain-aware</span><span className="h">Smooth Moon</span>
                  <span className="k">Sunlit</span><span className="v">{fmtPct(w30.sunlitFrac)}</span><span className="v">{fmtPct(w30.smoothSunlitFrac)}</span>
                  <span className="k">Earth in sight</span><span className="v">{fmtPct(w30.earthFrac)}</span><span className="v">{fmtPct(w30.smoothEarthFrac)}</span>
                  <span className="k">Both at once</span><span className="v">{fmtPct(w30.bothFrac)}</span><span className="v">&#8212;</span>
                  <span className="k">Longest dark spell</span><span className="v">{fmtHours(w30.longestDarkH)}</span><span className="v">&#8212;</span>
                </div>
                <p className="note">&#8220;Smooth Moon&#8221; = same geometry with a 0&#176; horizon (no terrain), so you can see what the real terrain changes.</p>
              </section>
            )}
          </>
        )}

        {site.notes.length > 0 && (
          <section className="panel-section">
            <h3>Notes</h3>
            {site.notes.map((n, i) => (
              <p key={i} className="note">{n}</p>
            ))}
          </section>
        )}

        <section className="panel-section">
          <h3>Method &amp; limitations</h3>
          <p className="note caution" style={{ marginTop: 0 }}>{DTE_DISCLAIMER}</p>
          {METHOD_SUMMARY.slice(0, 3).map((m, i) => (
            <p key={i} className="note">{m}</p>
          ))}
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setLimitsOpen(!limitsOpen)} aria-expanded={limitsOpen}>
            {limitsOpen ? "Hide" : "Show"} all limitations ({LIMITATIONS.length})
          </button>
          {limitsOpen && (
            <ul style={{ paddingLeft: 18, margin: "8px 0 0" }}>
              {LIMITATIONS.map((l, i) => (
                <li key={i} className="note" style={{ marginBottom: 6 }}>{l}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel-section">
          <h3>Sources</h3>
          {siteSources.map((s) => (
            <p key={s.id} className="note" style={{ margin: "0 0 5px" }}>
              <span className="mono">{s.id}</span>{" "}
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> &#8212; {s.org}
            </p>
          ))}
        </section>

        <div className="actions" style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={() => toggleCompare(site.id)}>Add to compare</button>
          <button className="btn" onClick={() => setPanel("assistant")}>Ask the assistant</button>
        </div>
      </div>
    </aside>
  );
}

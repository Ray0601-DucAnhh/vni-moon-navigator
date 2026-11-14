/** App shell: top bar, globe canvas, drawers/panels/popup, time bar, legend,
 *  About dialog, loading & error states, and a non-WebGL fallback. */

import { useEffect, useMemo, useState } from "react";
import { MoonScene } from "../features/globe/MoonScene";
import { SitePopup } from "../features/sites/SitePopup";
import { SiteDetailPanel } from "../features/sites/SiteDetailPanel";
import { SiteList } from "../features/sites/SiteList";
import { TimeBar } from "../features/time/TimeBar";
import { ComparePanel } from "../features/compare/ComparePanel";
import { AssistantPanel } from "../features/assistant/AssistantPanel";
import { AboutDialog } from "../features/about/AboutDialog";
import { useApp } from "../store/appStore";
import { useSiteData } from "../services/data/useSiteData";
import { loadRegions, loadSources } from "../services/data/loaders";
import type { RegionEntry, SourceRecord } from "../types";

function webglAvailable(): boolean {
  // Test hook: ?nowebgl forces the fallback so the no-WebGL state can be
  // exercised on browsers that do support WebGL (QA F-05).
  if (new URLSearchParams(location.search).has("nowebgl")) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function App() {
  const data = useSiteData();
  const [regions, setRegions] = useState<RegionEntry[]>([]);
  const [regionsNote, setRegionsNote] = useState("");
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [canvasReady, setCanvasReady] = useState(false);
  const webgl = useMemo(webglAvailable, []);

  const selectedSiteId = useApp((s) => s.selectedSiteId);
  const rightPanel = useApp((s) => s.rightPanel);
  const drawerOpen = useApp((s) => s.drawerOpen);
  const setDrawer = useApp((s) => s.setDrawer);
  const setPanel = useApp((s) => s.setPanel);
  const setAbout = useApp((s) => s.setAbout);
  const selectSite = useApp((s) => s.selectSite);
  const requestFocus = useApp((s) => s.requestFocus);
  const showEarthDir = useApp((s) => s.showEarthDir);
  const setShowEarthDir = useApp((s) => s.setShowEarthDir);

  useEffect(() => {
    loadRegions().then((r) => {
      setRegions(r.regions);
      setRegionsNote(r.note);
    }).catch(() => undefined);
    loadSources().then((s) => setSources(s.sources)).catch(() => undefined);
  }, []);

  // Esc closes the top-most layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const st = useApp.getState();
      if (st.aboutOpen) return; // dialog handles itself
      if (st.rightPanel !== "none") setPanel("none");
      else if (st.drawerOpen) setDrawer(false);
      else if (st.selectedSiteId) selectSite(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPanel, setDrawer, selectSite]);

  const selected = data.sites.find((s) => s.id === selectedSiteId) ?? null;
  const selectedLoaded = selected ? data.loaded[selected.id] ?? null : null;

  if (data.phase === "error") {
    return (
      <div className="app">
        <div className="center-fill">
          <div className="moon-silhouette" />
          <p className="note caution">Could not load the site data: {data.error}</p>
          <button className="btn" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {webgl ? (
        <div className="canvas-wrap">
          {data.phase === "ready" && <MoonScene data={data} onReady={() => setCanvasReady(true)} />}
        </div>
      ) : (
        <div className="center-fill" style={{ justifyContent: "flex-start", paddingTop: 90, overflowY: "auto" }}>
          <p className="note caution" style={{ maxWidth: 520, textAlign: "center" }}>
            3D (WebGL) is unavailable in this browser, so the globe is hidden. Everything else works:
            pick a site from the list and use the panels below.
          </p>
          <img src="/textures/moon_color_2k.jpg" alt="Moon surface map (equirectangular)" style={{ maxWidth: "min(640px, 92vw)", borderRadius: 12 }} />
        </div>
      )}

      {(data.phase === "loading" || (webgl && !canvasReady)) && (
        <div className="center-fill" style={{ background: "var(--bg)" }}>
          <div className="moon-silhouette" />
          <p className="note">Loading lunar surface &amp; ephemerides&#8230;</p>
        </div>
      )}

      <header className="topbar">
        <div className="brand">
          VNI Moon Navigator
          <small>Terrain-aware Sun &amp; Earth visibility at lunar landing sites</small>
        </div>
        <span className="spacer" />
        <button className={`btn sm${drawerOpen ? " active" : ""}`} onClick={() => setDrawer(!drawerOpen)}>Sites</button>
        <button className="btn sm" onClick={() => { selectSite("im2"); requestFocus(-85, 29); }}>South pole</button>
        <button className={`btn sm${showEarthDir ? " active" : ""}`} onClick={() => setShowEarthDir(!showEarthDir)} title="Show/hide the Sun and Earth direction indicators">
          Directions
        </button>
        <button className={`btn sm${rightPanel === "compare" ? " active" : ""}`} onClick={() => setPanel(rightPanel === "compare" ? "none" : "compare")}>Compare</button>
        <button className={`btn sm${rightPanel === "assistant" ? " active" : ""}`} onClick={() => setPanel(rightPanel === "assistant" ? "none" : "assistant")}>Assistant</button>
        <button className="btn sm" onClick={() => setAbout(true)}>About the data</button>
      </header>

      {data.phase === "ready" && !selected && canvasReady && (
        <div className="hint">Select a landing site to see its Sun &amp; Earth</div>
      )}

      {selected && rightPanel !== "detail" && (
        <SitePopup
          site={selected}
          ls={selectedLoaded}
          loadError={selected.analysed ? data.failed[selected.id] ?? null : null}
          onRetry={() => data.retry(selected.id)}
        />
      )}

      {drawerOpen && <SiteList sites={data.sites} regions={regions} regionsNote={regionsNote} />}

      {rightPanel === "detail" && selected && (
        <SiteDetailPanel site={selected} ls={selectedLoaded} sources={sources} />
      )}
      {rightPanel === "compare" && <ComparePanel loaded={data.loaded} />}
      {rightPanel === "assistant" && <AssistantPanel data={data} regions={regions} sources={sources} />}

      <div className="legend" aria-hidden>
        <div className="row"><span className="swatch clps" /> CLPS landing (analysed: IM-2, IM-1)</div>
        <div className="row"><span className="swatch crewed" /> Apollo landing (context)</div>
        <div className="row"><span className="swatch national" /> Other program (context)</div>
        <div className="row" style={{ color: "var(--text-faint)" }}>Drag to rotate &#183; scroll to zoom</div>
      </div>

      <TimeBar />
      <AboutDialog sources={sources} />
    </div>
  );
}

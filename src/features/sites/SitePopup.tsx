/** Compact site popup (desktop: floating card near the top-left of the
 *  canvas; mobile: bottom sheet via CSS). Shows the decision metrics only. */

import { useApp } from "../../store/appStore";
import type { Site, SiteImage } from "../../types";
import type { LoadedSite } from "../../services/data/useSiteData";
import { useSiteNow } from "./useSiteState";
import { fmtDeg, fmtLatLon } from "../../lib/format";
import { fmtDuration } from "../../lib/time";
import { azCompass } from "../../lib/format";

const CATEGORY_LABEL: Record<Site["category"], string> = {
  "Landed - CLPS": "Landed · CLPS robotic",
  "Landed - historic crewed": "Landed · Apollo (crewed)",
  "Landed - other national program": "Landed · national program",
};

export function SitePopup({
  site,
  image,
  ls,
  loadError,
  loading = false,
  onRetry,
}: {
  site: Site;
  image?: SiteImage;
  ls: LoadedSite | null;
  loadError: string | null;
  loading?: boolean;
  onRetry: () => void;
}) {
  const now = useSiteNow(ls);
  const setPanel = useApp((s) => s.setPanel);
  const toggleCompare = useApp((s) => s.toggleCompare);
  const selectSite = useApp((s) => s.selectSite);
  const setAbout = useApp((s) => s.setAbout);

  return (
    <div className="popup" role="dialog" aria-label={`${site.name} summary`} style={{ top: "calc(var(--top-h) + 10px)", left: 16 }}>
      {image && (
        <figure className="popup-photo">
          <img src={image.image} alt={image.caption} loading="lazy" width={480} height={270} />
          <figcaption title={`${image.caption} Photo: ${image.author} (${image.license}).`}>
            {image.kind === "on the Moon" ? "On the Moon" : image.kind === "before launch" ? "Before launch" : image.kind === "full-scale model" ? "Full-scale model" : "Scale model"}
            {" · "}
            <a href={image.sourcePage} target="_blank" rel="noreferrer noopener">{image.author.length > 34 ? image.author.slice(0, 32) + "…" : image.author}</a>
            {" · "}{image.license}
          </figcaption>
        </figure>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <h3>{site.name}</h3>
          <span className="badge">{CATEGORY_LABEL[site.category]}</span>
        </div>
        <button className="close-x" aria-label="Close" onClick={() => selectSite(null)}>&#10005;</button>
      </div>

      <div className="stat-row"><span className="k">Coordinates</span><span className="v">{fmtLatLon(site.latDeg, site.lonDeg)}</span></div>

      {!site.analysed && (
        <p className="note">
          Context site: shown for orientation only - no terrain-aware analysis is available for
          it in this build.
        </p>
      )}

      {site.analysed && !now && !loadError && (loading || !ls) && (
        <p className="note" aria-live="polite">Loading this site's Sun/Earth and terrain data&#8230;</p>
      )}

      {site.analysed && loadError && (
        <>
          <p className="note caution">Sun/Earth data unavailable for this site ({loadError}).</p>
          <button className="btn sm" onClick={onRetry}>Retry</button>
        </>
      )}

      {site.analysed && now && (
        <>
          <div className="stat-row">
            <span className="k">Sun</span>
            <span className="v">
              {fmtDeg(now.state.sun.elDeg, 2)} el &#183; {azCompass(now.state.sun.azDeg)}{" "}
              {now.state.sun.sunlit ? <span className="badge sun">sunlit</span> : <span className="badge off">below terrain</span>}
            </span>
          </div>
          <div className="stat-row">
            <span className="k">Horizon at Sun az</span>
            <span className="v">{fmtDeg(now.state.sun.horizonElDeg, 2)} &#183; disc {Math.round(now.state.sun.visibleFraction * 100)}%</span>
          </div>
          <div className="stat-row">
            <span className="k">Earth</span>
            <span className="v">
              {fmtDeg(now.state.earth.elDeg, 2)} el{" "}
              {now.state.earth.visible ? <span className="badge earth">in sight (geometric)</span> : <span className="badge off">behind terrain/limb</span>}
            </span>
          </div>
          <div className="stat-row">
            <span className="k">{now.nextSun?.type === "set" ? "Sunset in" : now.nextSun ? "Sunrise in" : "Sun events"}</span>
            <span className="v">{now.sunCountdownMs !== null ? fmtDuration(now.sunCountdownMs) : "none before window end"}</span>
          </div>
          <div className="stat-row">
            <span className="k">{now.nextEarth?.type === "set" ? "Earthset in" : now.nextEarth ? "Earthrise in" : "Earth events"}</span>
            <span className="v">{now.earthCountdownMs !== null ? fmtDuration(now.earthCountdownMs) : "none in data window"}</span>
          </div>
          <button
            className="badge"
            style={{ cursor: "pointer", marginTop: 6 }}
            onClick={() => setAbout(true)}
            title="About the data and methods"
          >
            Terrain-aware &#183; {ls?.bundle.mask.terrainFamily === "sldem" ? "SLDEM2015" : "LOLA DEM"} &#183; JPL Horizons &#9432;
          </button>
          <div className="actions">
            <button className="btn primary" onClick={() => setPanel("detail")}>View more information</button>
            <button className="btn" onClick={() => toggleCompare(site.id)}>Compare</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Keyboard-accessible site list drawer, including the honest list of
 *  officially named regions WITHOUT published coordinates. */

import { useEffect, useRef } from "react";
import { useApp } from "../../store/appStore";
import type { RegionEntry, Site } from "../../types";

const CAT_ORDER: Site["category"][] = [
  "Landed - CLPS",
  "Landed - historic crewed",
  "Landed - other national program",
];
const CAT_TITLES: Record<Site["category"], string> = {
  "Landed - CLPS": "CLPS robotic landings",
  "Landed - historic crewed": "Apollo (crewed) landings",
  "Landed - other national program": "Other national programs",
};
const SWATCH: Record<Site["category"], string> = {
  "Landed - CLPS": "clps",
  "Landed - historic crewed": "crewed",
  "Landed - other national program": "national",
};

export function SiteList({
  sites,
  regions,
  regionsNote,
}: {
  sites: Site[];
  regions: RegionEntry[];
  regionsNote: string;
}) {
  const setDrawer = useApp((s) => s.setDrawer);
  const selectSite = useApp((s) => s.selectSite);
  const requestFocus = useApp((s) => s.requestFocus);
  const selectedId = useApp((s) => s.selectedSiteId);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  let first = true;
  return (
    <nav className="drawer" aria-label="Site list">
      <header style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--panel-border)" }}>
        <strong style={{ flex: 1, fontFamily: "var(--font-display)" }}>Sites</strong>
        <button className="close-x" aria-label="Close site list" onClick={() => setDrawer(false)}>&#10005;</button>
      </header>
      <div style={{ overflowY: "auto", flex: 1, paddingBottom: 10 }}>
        {CAT_ORDER.map((cat) => (
          <div key={cat}>
            <div className="group-title">{CAT_TITLES[cat]}</div>
            {sites.filter((s) => s.category === cat).map((s) => {
              const refProp = first ? { ref: firstRef } : {};
              first = false;
              return (
                <button
                  key={s.id}
                  {...refProp}
                  className={`site-item${selectedId === s.id ? " selected" : ""}`}
                  onClick={() => {
                    selectSite(s.id);
                    requestFocus(s.latDeg, s.lonDeg);
                    setDrawer(false); // the popup opens where the drawer sits
                  }}
                >
                  <span className={`swatch ${SWATCH[s.category]}`} aria-hidden />
                  <span className="nm">
                    {s.shortName}
                    <span className="cat">{s.analysed ? "terrain-aware analysis" : "context only (no analysis)"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        <div className="group-title">Regions without published coordinates</div>
        <p className="note" style={{ padding: "0 14px" }}>{regionsNote}</p>
        {regions.map((r, i) => (
          <div key={i} className="region-item">
            {r.name}
            <small>{r.category} &#183; {r.mission} &#183; {r.sourceIds.join(", ")}</small>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** Floating card for the south-polar terrain map: layer switch, colour scale,
 *  value under the pointer, and the method/limits in one line. */

import { useEffect, useState } from "react";
import { useApp, type PolarLayer } from "../../store/appStore";
import { loadPolarStats } from "../../services/data/polar";
import { POLAR_RAMPS } from "../globe/PolarMapLayer";
import { POLAR_SCALE_MAX, nearestNode, nodeStats, type PolarStats } from "../../services/science/polarGrid";

const LABELS: Record<Exclude<PolarLayer, "off">, { short: string; long: string }> = {
  sun: { short: "Sunlit", long: "Time the Sun's centre is above the terrain horizon" },
  earth: { short: "Earth in sight", long: "Time the Earth's centre is above the terrain horizon (geometric, not a radio link)" },
  both: { short: "Both", long: "Time with the Sun AND the Earth above the terrain horizon" },
};

export function PolarMapControls() {
  const layer = useApp((s) => s.polarLayer);
  const setLayer = useApp((s) => s.setPolarLayer);
  const hover = useApp((s) => s.polarHover);
  const drawerOpen = useApp((s) => s.drawerOpen);
  const [stats, setStats] = useState<PolarStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (layer === "off" || stats) return;
    loadPolarStats().then(setStats).catch((e: Error) => setErr(e.message));
  }, [layer, stats]);

  if (layer === "off") return null;
  const ramp = POLAR_RAMPS[layer];
  const hn = hover ? nearestNode(hover.latDeg, hover.lonDeg) : null;
  const hs = stats && hn ? nodeStats(stats, hn.idx) : null;
  const val = hs ? (layer === "sun" ? hs.sunlitFrac : layer === "earth" ? hs.earthFrac : hs.bothFrac) : null;

  return (
    <section className={`polar-card${drawerOpen ? " shifted" : ""}`} aria-label="South-polar terrain map">
      <div className="polar-card-head">
        <strong>South-polar terrain map</strong>
        <button className="close-x" onClick={() => setLayer("off")} aria-label="Hide the polar map">×</button>
      </div>
      <div className="seg" role="radiogroup" aria-label="Map layer">
        {(Object.keys(LABELS) as Exclude<PolarLayer, "off">[]).map((k) => (
          <button key={k} role="radio" aria-checked={layer === k} className={`btn sm${layer === k ? " active" : ""}`} onClick={() => setLayer(k)}>
            {LABELS[k].short}
          </button>
        ))}
      </div>
      <div className="polar-scale" aria-hidden>
        <div className="bar" style={{ background: `linear-gradient(to right, ${ramp[0]}, ${ramp[1]}, ${ramp[2]})` }} />
        <div className="ticks"><span>0%</span><span>{(POLAR_SCALE_MAX[layer] * 50).toFixed(0)}%</span><span>{POLAR_SCALE_MAX[layer] < 1 ? "≥" : ""}{(POLAR_SCALE_MAX[layer] * 100).toFixed(0)}%</span></div>
      </div>
      <p className="note" style={{ margin: "2px 0 0" }}>{LABELS[layer].long}, over the data year (2026-11-01 → 2027-11-01).</p>
      <p className="polar-readout mono" aria-live="polite">
        {err ? <span className="caution">Map data failed to load: {err}</span>
          : !stats ? "Loading map data…"
          : hover && hs && val !== null
            ? <>{hover.latDeg.toFixed(2)}°, {hover.lonDeg.toFixed(1)}°E · <strong>{(val * 100).toFixed(1)}%</strong> · {hs.demHeightM} m</>
            : "Hover the map for a value · click for the full analysis"}
      </p>
      <p className="note" style={{ margin: "4px 0 0" }}>
        LOLA 80 m terrain, 2 km grid, observer 2 m up. A regional comparison - not a landing-safety assessment.
        No region boundaries are drawn (none are published).
      </p>
    </section>
  );
}

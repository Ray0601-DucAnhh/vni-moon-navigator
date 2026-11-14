/** Side-by-side comparison of the two analysed sites at the shared selected
 *  time. Neutral presentation - no score, no better/worse colouring. */

import { useApp } from "../../store/appStore";
import type { LoadedSite } from "../../services/data/useSiteData";
import type { Site } from "../../types";
import { getSiteState, windowStats } from "../../services/science/core";
import { azCompass, fmtDeg, fmtHours, fmtPct } from "../../lib/format";
import { DTE_DISCLAIMER } from "../../content/text";

export function ComparePanel({ loaded, sites }: { loaded: Record<string, LoadedSite>; sites: Site[] }) {
  const compareIds = useApp((s) => s.compareIds);
  const setPanel = useApp((s) => s.setPanel);
  const toggleCompare = useApp((s) => s.toggleCompare);
  const utcMs = useApp((s) => s.utcMs);

  const pair = compareIds.map((id) => loaded[id]).filter(Boolean);

  return (
    <aside className="right-panel" aria-label="Site comparison">
      <header>
        <h2>Compare sites</h2>
        <button className="close-x" aria-label="Close panel" onClick={() => setPanel("none")}>&#10005;</button>
      </header>
      <div className="panel-body">
        {pair.length < 2 ? (
          <p className="note">
            Pick any two sites with the &#8220;Compare&#8221; button on their popups (or in their detail panel).
            Currently selected:{" "}
            {compareIds.map((id) => sites.find((s) => s.id === id)?.shortName ?? id).join(", ") || "none"}
            {compareIds.length > pair.length ? " (loading data…)" : ""}.
          </p>
        ) : (
          (() => {
            const [a, b] = pair;
            const sa = getSiteState(a.acc, a.bundle.mask, utcMs);
            const sb = getSiteState(b.acc, b.bundle.mask, utcMs);
            const wa = windowStats(a.acc, a.bundle.mask, utcMs, 30);
            const wb = windowStats(b.acc, b.bundle.mask, utcMs, 30);
            return (
              <>
                <div className="cmp-grid">
                  <span className="h">At selected time</span>
                  <span className="h">{a.bundle.site.shortName}</span>
                  <span className="h">{b.bundle.site.shortName}</span>

                  <span className="k">Sun elevation</span>
                  <span className="v">{fmtDeg(sa.sun.elDeg, 2)}</span>
                  <span className="v">{fmtDeg(sb.sun.elDeg, 2)}</span>

                  <span className="k">Terrain horizon at Sun az</span>
                  <span className="v">{fmtDeg(sa.sun.horizonElDeg, 2)}</span>
                  <span className="v">{fmtDeg(sb.sun.horizonElDeg, 2)}</span>

                  <span className="k">Sunlit (terrain)</span>
                  <span className="v">{sa.sun.sunlit ? "yes" : "no"}</span>
                  <span className="v">{sb.sun.sunlit ? "yes" : "no"}</span>

                  <span className="k">Earth elevation</span>
                  <span className="v">{fmtDeg(sa.earth.elDeg, 2)} ({azCompass(sa.earth.azDeg)})</span>
                  <span className="v">{fmtDeg(sb.earth.elDeg, 2)} ({azCompass(sb.earth.azDeg)})</span>

                  <span className="k">Earth in sight (geometric)</span>
                  <span className="v">{sa.earth.visible ? "yes" : "no"}</span>
                  <span className="v">{sb.earth.visible ? "yes" : "no"}</span>

                  <span className="h">Next 30 days</span><span className="h"></span><span className="h"></span>

                  <span className="k">Sunlit time</span>
                  <span className="v">{fmtPct(wa.sunlitFrac)}</span>
                  <span className="v">{fmtPct(wb.sunlitFrac)}</span>

                  <span className="k">&#8230; smooth-Moon reference</span>
                  <span className="v">{fmtPct(wa.smoothSunlitFrac)}</span>
                  <span className="v">{fmtPct(wb.smoothSunlitFrac)}</span>

                  <span className="k">Earth in sight</span>
                  <span className="v">{fmtPct(wa.earthFrac)}</span>
                  <span className="v">{fmtPct(wb.earthFrac)}</span>

                  <span className="k">Sunlit + Earth at once</span>
                  <span className="v">{fmtPct(wa.bothFrac)}</span>
                  <span className="v">{fmtPct(wb.bothFrac)}</span>

                  <span className="k">Longest dark spell</span>
                  <span className="v">{fmtHours(wa.longestDarkH)}</span>
                  <span className="v">{fmtHours(wb.longestDarkH)}</span>
                </div>
                <p className="note" style={{ marginTop: 12 }}>
                  Values are shown side by side without ranking: which trade-off matters depends on the
                  mission. {DTE_DISCLAIMER}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {pair.map((p) => (
                    <button key={p.bundle.site.id} className="btn sm" onClick={() => toggleCompare(p.bundle.site.id)}>
                      Remove {p.bundle.site.shortName}
                    </button>
                  ))}
                </div>
              </>
            );
          })()
        )}
      </div>
    </aside>
  );
}

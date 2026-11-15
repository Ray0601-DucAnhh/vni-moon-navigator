/** "Find operation windows": every interval in the data year when the chosen
 *  conditions hold together for at least N hours (temporal feasibility). */

import { useMemo, useState } from "react";
import { useApp } from "../../store/appStore";
import type { LoadedSite } from "../../services/data/useSiteData";
import { findOperationWindows, totalHours, type WindowCriteria } from "../../services/science/planning";
import { parseIsoUtc } from "../../lib/time";

const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ");
const Cell = ({ iso, mark }: { iso: string; mark: string }) => (
  <>
    {mark}{iso.slice(0, 10)}
    <br />
    <span style={{ color: "var(--text-muted)" }}>{iso.slice(11, 16)}</span>
  </>
);

export function WindowFinder({ ls }: { ls: LoadedSite }) {
  const setUtc = useApp((s) => s.setUtc);
  const [needSun, setNeedSun] = useState(true);
  const [needEarth, setNeedEarth] = useState(true);
  const [minH, setMinH] = useState(48);
  const [minSun, setMinSun] = useState(0);

  const criteria: WindowCriteria = { needSun, needEarth, minDurationH: Math.max(0, minH), minSunClearanceDeg: Math.max(0, minSun) };
  const windows = useMemo(
    () => findOperationWindows(ls.acc, ls.bundle.mask, ls.acc.startMs, ls.acc.endMs, criteria),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ls, needSun, needEarth, minH, minSun],
  );
  const hours = totalHours(windows);

  return (
    <section className="panel-section" aria-label="Find operation windows">
      <h3>Find operation windows</h3>
      <p className="note" style={{ marginTop: 0 }}>
        Every period in the data year (2026-11-01 → 2027-11-01 UTC) when all chosen conditions hold at once.
      </p>
      <div className="wf-controls">
        <label><input type="checkbox" checked={needSun} onChange={(e) => setNeedSun(e.target.checked)} /> Sun above terrain</label>
        <label><input type="checkbox" checked={needEarth} onChange={(e) => setNeedEarth(e.target.checked)} /> Earth in sight (geometric)</label>
        <label>
          Sun at least
          <input type="number" min={0} max={30} step={0.5} value={minSun} onChange={(e) => setMinSun(Number(e.target.value) || 0)} aria-label="Minimum Sun clearance above terrain, degrees" />
          ° above terrain
        </label>
        <label>
          Lasting at least
          <input type="number" min={0} max={720} step={1} value={minH} onChange={(e) => setMinH(Number(e.target.value) || 0)} aria-label="Minimum window length, hours" />
          h
        </label>
      </div>
      {!needSun && !needEarth ? (
        <p className="note">Pick at least one condition.</p>
      ) : windows.length === 0 ? (
        <p className="note">No window meets these conditions in the data year.</p>
      ) : (
        <>
          <p className="note" style={{ margin: "6px 0" }}>
            <strong>{windows.length}</strong> window{windows.length === 1 ? "" : "s"} · {hours.toFixed(0)} h in total · edges accurate to ~30 s
          </p>
          <div className="wf-scroll">
            <table className="mini-table">
              <thead>
                <tr><th>Start (UTC)</th><th>End (UTC)</th><th>Length</th><th /></tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.startUtc}>
                    <td><Cell iso={w.startUtc} mark={w.startClipped ? "≤ " : ""} /></td>
                    <td><Cell iso={w.endUtc} mark={w.endClipped ? "≥ " : ""} /></td>
                    <td>{w.durationH.toFixed(0)} h</td>
                    <td>
                      <button className="btn sm" onClick={() => setUtc(parseIsoUtc(w.startUtc) + 60_000)} aria-label={`Jump to the start of the window at ${fmt(w.startUtc)} UTC`}>
                        Go
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="note">
        "≤ / ≥" = window cut by the edge of the data range. Earth in sight is geometric line of sight only, not a
        radio link. Terrain resolution limits apply (see Resolution check above).
      </p>
    </section>
  );
}

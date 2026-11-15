/** Level A baseline for a coordinate the user types in: Sun/Earth now, next
 *  events and operation windows over a FLAT horizon (no terrain). The app
 *  never fills in coordinates itself (decision D-04). */

import { useMemo, useState } from "react";
import { useApp } from "../../store/appStore";
import type { MoonGeocentric } from "../../types";
import type { LoadedSite } from "../../services/data/useSiteData";
import { findCrossings, getSiteState, sunClearance, earthClearance } from "../../services/science/core";
import { makeCustomPoint } from "../../services/science/customPoint";
import { fmtDeg, azCompass } from "../../lib/format";
import { WindowFinder } from "./WindowFinder";
import { nearestNode } from "../../services/science/polarGrid";

export function CustomPoint({ geo }: { geo: MoonGeocentric | null }) {
  const utcMs = useApp((s) => s.utcMs);
  const openMapPoint = useApp((s) => s.openMapPoint);
  const setPolarLayer = useApp((s) => s.setPolarLayer);
  const polarLayer = useApp((s) => s.polarLayer);
  const requestFocus = useApp((s) => s.requestFocus);
  const [latIn, setLatIn] = useState("");
  const [lonIn, setLonIn] = useState("");
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const model = useMemo(() => (geo && point ? makeCustomPoint(geo, point.lat, point.lon) : null), [geo, point]);
  const ls = useMemo(
    () => (model ? ({ acc: model.acc, bundle: { mask: model.mask } } as unknown as LoadedSite) : null),
    [model],
  );
  const state = model ? getSiteState(model.acc, model.mask, utcMs) : null;
  const next = useMemo(() => {
    if (!model) return null;
    const t1 = Math.min(model.acc.endMs, utcMs + 40 * 86_400_000);
    if (utcMs < model.acc.startMs || utcMs >= t1) return null;
    const sun = findCrossings((t) => sunClearance(model.acc, model.mask, t), utcMs, t1, 600_000, 30_000)[0] ?? null;
    const earth = findCrossings((t) => earthClearance(model.acc, model.mask, t), utcMs, t1, 600_000, 30_000)[0] ?? null;
    return { sun, earth };
  }, [model, utcMs]);

  const analyse = () => {
    const lat = Number(latIn);
    const lon = Number(lonIn);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || latIn.trim() === "") return setError("Latitude must be between -90 and 90 (° N positive).");
    if (!Number.isFinite(lon) || lon < -180 || lon > 360 || lonIn.trim() === "") return setError("Longitude must be between -180 and 360 (° E positive).");
    setError(null);
    setPoint({ lat, lon: lon > 180 ? lon - 360 : lon });
  };

  return (
    <div className="custom-point" aria-label="Custom point (Level A)">
      <div className="group-title">Custom point (Level A baseline)</div>
      <p className="note" style={{ padding: "0 14px", margin: "0 0 6px" }}>
        Type any coordinate (e.g. a published landing target you found). Sun and Earth come from JPL Horizons
        sub-solar/sub-Earth points; the horizon is <strong>flat 0°, no terrain</strong> - real terrain can change
        results by several degrees.
      </p>
      <div className="cp-form">
        <label>Lat (°N)<input inputMode="decimal" value={latIn} onChange={(e) => setLatIn(e.target.value)} placeholder="-84.79" aria-label="Latitude, degrees north" /></label>
        <label>Lon (°E)<input inputMode="decimal" value={lonIn} onChange={(e) => setLonIn(e.target.value)} placeholder="29.20" aria-label="Longitude, degrees east" /></label>
        <button className="btn sm primary" onClick={analyse} disabled={!geo}>Analyse</button>
      </div>
      {error && <p className="note caution" style={{ padding: "0 14px" }}>{error}</p>}
      {state && point && (
        <div className="cp-result">
          <p className="note" style={{ margin: "4px 0" }}>
            <strong>{point.lat.toFixed(4)}°, {point.lon.toFixed(4)}°E</strong> · Level A - flat horizon, no terrain
          </p>
          <div className="stat-row"><span className="k">Sun</span><span className="v">{fmtDeg(state.sun.elDeg, 2)} el · {azCompass(state.sun.azDeg)} · {state.sun.smoothSunlit ? "above horizon" : "below horizon"}</span></div>
          <div className="stat-row"><span className="k">Earth</span><span className="v">{fmtDeg(state.earth.elDeg, 2)} el · {state.earth.smoothVisible ? "in sight (geometric)" : "below horizon"}</span></div>
          <div className="stat-row"><span className="k">Next Sun event</span><span className="v">{next?.sun ? `${next.sun.type} ${next.sun.utc.slice(0, 16).replace("T", " ")} UTC` : "none in next 40 days"}</span></div>
          <div className="stat-row"><span className="k">Next Earth event</span><span className="v">{next?.earth ? `${next.earth.type} ${next.earth.utc.slice(0, 16).replace("T", " ")} UTC` : "none in next 40 days"}</span></div>
          {nearestNode(point.lat, point.lon) && (
            <div className="cp-polar">
              <p className="note" style={{ margin: "6px 0 4px" }}>
                This point is inside the south-polar terrain map - real terrain is available here.
              </p>
              <button
                className="btn sm primary"
                onClick={() => {
                  if (polarLayer === "off") setPolarLayer("sun");
                  openMapPoint(point.lat, point.lon);
                  requestFocus(point.lat, point.lon, 1.45);
                }}
              >
                Analyse with terrain (Level B-grid)
              </button>
            </div>
          )}
          {ls && <WindowFinder ls={ls} flat />}
        </div>
      )}
    </div>
  );
}

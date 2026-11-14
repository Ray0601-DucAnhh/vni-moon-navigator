/** 360-degree horizon panorama: the DEM-derived terrain silhouette with the
 *  Sun (drawn to angular size) and Earth at their current az/el. SVG. */

import { useMemo, useState } from "react";
import type { HorizonMask, SiteState } from "../../types";
import { SUN_ANGULAR_RADIUS_DEG, horizonDistAt, horizonElAt } from "../../services/science/core";
import { azCompass, fmtDeg } from "../../lib/format";

const W = 720;
const H = 190;
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 22;

export function HorizonPanorama({ mask, state }: { mask: HorizonMask; state: SiteState }) {
  const [hover, setHover] = useState<{ az: number; el: number; dist: number } | null>(null);

  const elMax = useMemo(() => Math.max(6, Math.ceil(Math.max(...mask.horizonElDeg, state.sun.elDeg, state.earth.elDeg) + 2)), [mask, state]);
  const elMin = useMemo(() => Math.min(-3, Math.floor(Math.min(...mask.horizonElDeg) - 1)), [mask]);

  const xOf = (az: number) => PAD_L + ((az % 360) / 360) * (W - PAD_L - PAD_R);
  const yOf = (el: number) => PAD_T + ((elMax - el) / (elMax - elMin)) * (H - PAD_T - PAD_B);

  const terrainPath = useMemo(() => {
    const pts: string[] = [];
    for (let k = 0; k <= 3600; k += 5) {
      pts.push(`${k === 0 ? "M" : "L"}${(PAD_L + (k / 3600) * (W - PAD_L - PAD_R)).toFixed(1)},${yOf(mask.horizonElDeg[k % 3600]).toFixed(1)}`);
    }
    return `${pts.join("")}L${W - PAD_R},${H - PAD_B}L${PAD_L},${H - PAD_B}Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mask, elMax, elMin]);

  const sunX = xOf(state.sun.azDeg);
  const sunY = yOf(state.sun.elDeg);
  const sunRx = (SUN_ANGULAR_RADIUS_DEG / 360) * (W - PAD_L - PAD_R);
  const sunRy = (SUN_ANGULAR_RADIUS_DEG / (elMax - elMin)) * (H - PAD_T - PAD_B);
  const earthX = xOf(state.earth.azDeg);
  const earthY = yOf(state.earth.elDeg);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < PAD_L || px > W - PAD_R) return setHover(null);
    const az = ((px - PAD_L) / (W - PAD_L - PAD_R)) * 360;
    setHover({ az, el: horizonElAt(mask, az), dist: horizonDistAt(mask, az) });
  };

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", minWidth: 480, display: "block" }}
          role="img"
          aria-label={`Terrain horizon panorama. Sun at azimuth ${state.sun.azDeg.toFixed(1)} degrees, elevation ${state.sun.elDeg.toFixed(2)} degrees. Earth at azimuth ${state.earth.azDeg.toFixed(1)}, elevation ${state.earth.elDeg.toFixed(2)}.`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* sky */}
          <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} fill="#0a101e" />
          {/* elevation gridlines */}
          {[0, 5, 10, 15, 20].filter((g) => g >= elMin && g <= elMax).map((g) => (
            <g key={g}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yOf(g)} y2={yOf(g)} stroke={g === 0 ? "#9aa3b5" : "#232a3c"} strokeWidth={g === 0 ? 1 : 0.7} strokeDasharray={g === 0 ? "5 4" : undefined} />
              <text x={4} y={yOf(g) + 3.5} fontSize={9.5} fill="#808a9e">{g}&#176;</text>
            </g>
          ))}
          {/* terrain silhouette */}
          <path d={terrainPath} fill="rgba(61,68,88,0.6)" stroke="#8a94ad" strokeWidth={1.1} />
          {/* Earth */}
          <circle cx={earthX} cy={earthY} r={4.6} fill="#4fa3ff" stroke="#0a101e" strokeWidth={1} />
          <text x={earthX + 7} y={earthY - 5} fontSize={10} fill="#4fa3ff">Earth {fmtDeg(state.earth.elDeg, 1)}</text>
          {/* Sun: ellipse at true angular size, plus a visibility halo */}
          <ellipse cx={sunX} cy={sunY} rx={Math.max(sunRx, 1.4)} ry={Math.max(sunRy, 1.4)} fill="#f5a623" opacity={state.sun.visibleFraction > 0 ? 1 : 0.55} />
          <circle cx={sunX} cy={sunY} r={8} fill="none" stroke="#f5a623" strokeWidth={0.8} opacity={0.5} />
          <text x={sunX + 10} y={sunY + 3.5} fontSize={10} fill="#f5a623">Sun {fmtDeg(state.sun.elDeg, 2)}</text>
          {/* compass labels */}
          {[0, 90, 180, 270, 360].map((a) => (
            <g key={a}>
              <line x1={xOf(a === 360 ? 359.999 : a)} x2={xOf(a === 360 ? 359.999 : a)} y1={H - PAD_B} y2={H - PAD_B + 4} stroke="#808a9e" />
              <text x={xOf(a === 360 ? 359.999 : a)} y={H - 6} fontSize={10} fill="#9aa3b5" textAnchor="middle">
                {a === 0 || a === 360 ? "N" : a === 90 ? "E" : a === 180 ? "S" : "W"}
              </text>
            </g>
          ))}
          {hover && (
            <g>
              <line x1={xOf(hover.az)} x2={xOf(hover.az)} y1={PAD_T} y2={H - PAD_B} stroke="#9ec1ff" strokeWidth={0.7} opacity={0.6} />
              <text x={Math.min(xOf(hover.az) + 6, W - 150)} y={PAD_T + 11} fontSize={10} fill="#9ec1ff">
                az {hover.az.toFixed(1)}&#176; ({azCompass(hover.az)}) &#183; horizon {hover.el.toFixed(2)}&#176; &#183; {hover.dist.toFixed(1)} km
              </text>
            </g>
          )}
        </svg>
      </div>
      <figcaption className="note">
        Terrain silhouette from {mask.terrainFamily === "sldem" ? "SLDEM2015 (LOLA + SELENE)" : "LOLA DEMs"} ({mask.demFiles.join(", ")}); observer {mask.observerHeightM} m above the surface.
        Dashed line = 0&#176; local horizontal (smooth-Moon reference). Hover for the horizon in any direction.
      </figcaption>
    </figure>
  );
}

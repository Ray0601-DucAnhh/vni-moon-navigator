/** Level C timing sensitivity: if a mission landed on day X, how many hours of
 *  Sun + Earth together would its first 14 days give? Shaded band = the same
 *  computed with the terrain horizon raised/lowered by the site's RMS. */

import { useMemo, useState } from "react";
import type { LoadedSite } from "../../services/data/useSiteData";
import { landingDateSensitivity } from "../../services/science/planning";

const FIRST_DAYS = 14;

export function LandingDateChart({ ls }: { ls: LoadedSite }) {
  const [needEarth, setNeedEarth] = useState(true);
  const rms = ls.bundle.mask.resolutionSensitivity?.rmsDeg ?? 0;
  const series = useMemo(() => {
    const c = { needSun: true, needEarth, minDurationH: 0 };
    const run = (off: number) => landingDateSensitivity(ls.acc, ls.bundle.mask, { ...c, horizonOffsetDeg: off }, FIRST_DAYS);
    return { mid: run(0), lo: rms > 0 ? run(rms) : null, hi: rms > 0 ? run(-rms) : null };
  }, [ls, needEarth, rms]);

  const pts = series.mid;
  if (pts.length < 2) return null;
  const W = 600;
  const H = 150;
  const maxH = FIRST_DAYS * 24;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (h: number) => H - (h / maxH) * H;
  const line = (p: { usableH: number }[]) => p.map((q, i) => `${x(i).toFixed(1)},${y(q.usableH).toFixed(1)}`).join(" ");
  const band = series.lo && series.hi
    ? `${line(series.hi)} ${series.lo.map((q, i) => `${x(i).toFixed(1)},${y(q.usableH).toFixed(1)}`).reverse().join(" ")}`
    : null;
  let best = pts[0];
  let worst = pts[0];
  for (const p of pts) {
    if (p.usableH > best.usableH) best = p;
    if (p.usableH < worst.usableH) worst = p;
  }
  const months = pts.map((p, i) => ({ i, d: p.dateUtc })).filter((p) => p.d.endsWith("-01"));

  return (
    <section className="panel-section" aria-label="Landing-date sensitivity">
      <h3>Landing-date sensitivity</h3>
      <label className="note" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 0 }}>
        <input type="checkbox" checked={needEarth} onChange={(e) => setNeedEarth(e.target.checked)} />
        Require Earth in sight too (otherwise Sun only)
      </label>
      <svg viewBox={`0 0 ${W} ${H + 16}`} width="100%" role="img" aria-label={`Usable hours in the first ${FIRST_DAYS} days versus landing date`}>
        <line x1={0} y1={y(maxH / 2)} x2={W} y2={y(maxH / 2)} stroke="rgba(140,160,200,0.18)" strokeDasharray="4 4" />
        {months.map((m) => (
          <g key={m.d}>
            <line x1={x(m.i)} y1={0} x2={x(m.i)} y2={H} stroke="rgba(140,160,200,0.12)" />
            <text x={x(m.i) + 2} y={H + 12} fontSize={10} fill="#808a9e">{m.d.slice(2, 7)}</text>
          </g>
        ))}
        {band && <polygon points={band} fill="rgba(125,211,252,0.22)" />}
        <polyline points={line(pts)} fill="none" stroke="#7dd3fc" strokeWidth={1.8} />
      </svg>
      <p className="note">
        Hours of {needEarth ? "Sun + Earth together" : "sunlight"} in the first {FIRST_DAYS} days after landing, for each
        landing date in the data year (dashed line = half the time). Highest: {best.dateUtc} ({best.usableH.toFixed(0)} h);
        lowest: {worst.dateUtc} ({worst.usableH.toFixed(0)} h).
        {band ? ` Shaded band = terrain horizon ±${rms.toFixed(3)}° (resolution sensitivity).` : ""} Not a
        recommendation - one input among many for mission planning.
      </p>
    </section>
  );
}

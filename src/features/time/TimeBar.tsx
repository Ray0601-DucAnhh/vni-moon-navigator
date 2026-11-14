/** Time controls: Now/Live, UTC date-time entry, +/- steps, a +/-15-day
 *  scrubber, and dual UTC/local display. Keyboard: arrows +/-1 h, Shift +/-1 d. */

import { useEffect, useRef, useState } from "react";
import { useApp } from "../../store/appStore";
import { DAY_MS, HOUR_MS, fmtLocal, fmtUtc, toIsoUtc } from "../../lib/time";
import { EPH_WINDOW } from "../../services/data/window";

export function TimeBar() {
  const utcMs = useApp((s) => s.utcMs);
  const live = useApp((s) => s.live);
  const setUtc = useApp((s) => s.setUtc);
  const goLive = useApp((s) => s.goLive);
  const tickLive = useApp((s) => s.tickLive);
  const scrubAnchorMs = useApp((s) => s.scrubAnchorMs);
  const reanchorScrub = useApp((s) => s.reanchorScrub);
  const rangeError = useApp((s) => s.rangeError);
  const [editing, setEditing] = useState(false);
  const dtRef = useRef<HTMLInputElement>(null);

  // Live ticking.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(tickLive, 60_000);
    return () => window.clearInterval(id);
  }, [live, tickLive]);

  // Global keyboard shortcuts (ignored while typing in inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") setUtc(useApp.getState().utcMs - (e.shiftKey ? DAY_MS : HOUR_MS));
      else if (e.key === "ArrowRight") setUtc(useApp.getState().utcMs + (e.shiftKey ? DAY_MS : HOUR_MS));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setUtc]);

  const offsetDays = (utcMs - scrubAnchorMs) / DAY_MS;

  return (
    <div className="timebar" role="group" aria-label="Time controls">
      <div className="clock" aria-live="polite">
        <div className="utc">{fmtUtc(utcMs)}</div>
        <div className="local">{fmtLocal(utcMs)} &#183; your local time</div>
      </div>
      <button className={`btn sm${live ? " active" : ""}`} onClick={goLive} title="Jump to the current time (UTC) and keep following it">
        {live ? "● Live" : "Now"}
      </button>
      {!editing ? (
        <button className="btn sm" onClick={() => setEditing(true)} aria-label="Set date and time (UTC)">
          Set date/time
        </button>
      ) : (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            ref={dtRef}
            className="dt"
            type="text"
            defaultValue={toIsoUtc(utcMs).slice(0, 16)}
            aria-label="UTC date and time, format YYYY-MM-DDTHH:MM"
            size={17}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget.nextSibling as HTMLButtonElement | null)?.click();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button
            className="btn sm primary"
            onClick={() => {
              const v = dtRef.current?.value ?? "";
              const t = Date.parse(v.endsWith("Z") ? v : v + ":00Z");
              if (!Number.isFinite(t)) {
                useApp.getState().setRangeError(`Could not read "${v}" - use YYYY-MM-DDTHH:MM (UTC).`);
                return;
              }
              setUtc(t);
              reanchorScrub();
              setEditing(false);
            }}
          >
            Go
          </button>
          <button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
        </span>
      )}
      <button className="btn sm" onClick={() => setUtc(utcMs - DAY_MS)} aria-label="Back one day">&#8722;1 d</button>
      <button className="btn sm" onClick={() => setUtc(utcMs - HOUR_MS)} aria-label="Back one hour">&#8722;1 h</button>
      <input
        type="range"
        min={-15}
        max={15}
        step={1 / 48}
        value={Math.max(-15, Math.min(15, offsetDays))}
        aria-label="Scrub time, plus or minus 15 days"
        aria-valuetext={fmtUtc(utcMs)}
        onChange={(e) => setUtc(scrubAnchorMs + Number(e.target.value) * DAY_MS)}
        onPointerUp={reanchorScrub}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") reanchorScrub();
        }}
        title={`Scrub ±15 days around ${fmtUtc(scrubAnchorMs)}`}
      />
      <button className="btn sm" onClick={() => setUtc(utcMs + HOUR_MS)} aria-label="Forward one hour">+1 h</button>
      <button className="btn sm" onClick={() => setUtc(utcMs + DAY_MS)} aria-label="Forward one day">+1 d</button>
      <span className="note" style={{ margin: 0 }}>Data: {EPH_WINDOW.startLabel} &#8594; {EPH_WINDOW.endLabel} UTC</span>
      {rangeError && <div className="range-err" role="alert">{rangeError}</div>}
    </div>
  );
}

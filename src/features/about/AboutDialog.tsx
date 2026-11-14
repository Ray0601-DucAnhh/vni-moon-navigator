/** "About the data": what is computed vs illustrative, methods, limitations,
 *  sources and credits. Reachable from the top bar, popup badge and panel. */

import { useEffect, useRef } from "react";
import { useApp } from "../../store/appStore";
import type { SourceRecord } from "../../types";
import { ABOUT_COMPUTED, CREDITS, DTE_DISCLAIMER, LIMITATIONS, METHOD_SUMMARY } from "../../content/text";
import { EPH_WINDOW } from "../../services/data/window";

export function AboutDialog({ sources }: { sources: SourceRecord[] }) {
  const open = useApp((s) => s.aboutOpen);
  const setAbout = useApp((s) => s.setAbout);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbout(false);
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setAbout]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setAbout(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="About the data" tabIndex={-1} ref={ref}>
        <header style={{ display: "flex", padding: "14px 18px 10px", borderBottom: "1px solid var(--panel-border)" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 17, flex: 1 }}>About the data</h2>
          <button className="close-x" aria-label="Close" onClick={() => setAbout(false)}>&#10005;</button>
        </header>
        <div className="panel-body">
          <section className="panel-section" style={{ marginTop: 0 }}>
            <h3>Computed vs illustrative</h3>
            {ABOUT_COMPUTED.map((t, i) => (
              <p key={i} className="note">{t}</p>
            ))}
            <p className="note">Data window: {EPH_WINDOW.startLabel} to {EPH_WINDOW.endLabel} UTC. Analysed sites: IM-2 Athena and IM-1 Odysseus.</p>
          </section>
          <section className="panel-section">
            <h3>Methods &amp; verification</h3>
            {METHOD_SUMMARY.map((t, i) => (
              <p key={i} className="note">{t}</p>
            ))}
          </section>
          <section className="panel-section">
            <h3>Limitations</h3>
            <p className="note caution">{DTE_DISCLAIMER}</p>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {LIMITATIONS.map((l, i) => (
                <li key={i} className="note" style={{ marginBottom: 5 }}>{l}</li>
              ))}
            </ul>
          </section>
          <section className="panel-section">
            <h3>Sources</h3>
            {sources.map((s) => (
              <p key={s.id} className="note" style={{ margin: "0 0 5px" }}>
                <span className="mono">{s.id}</span>{" "}
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> &#8212; {s.org}. {s.note}
              </p>
            ))}
          </section>
          <section className="panel-section">
            <h3>Credits</h3>
            {CREDITS.map((c, i) => (
              <p key={i} className="note">{c}</p>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

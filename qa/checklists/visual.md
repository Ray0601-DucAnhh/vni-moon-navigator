# Visual acceptance checklist (run at 1440x900, 1280x720, 375x812 + one real phone)

| ID | Check | Measurable criterion |
|---|---|---|
| V-1 | Layout consistency | 8 px spacing rhythm; top bar 56 px; right panel ≤400 px; time bar ≥72 px |
| V-2 | Legibility | Body ≥14 px desktop / 15 px mobile; numerics in the mono face; no grey-on-grey below contrast bar |
| V-3 | Clipping | DevTools console script returns an empty list: `[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return s.overflow==='hidden'&&e.scrollWidth>e.clientWidth+1&&e.innerText?.trim()}).map(e=>e.className)` |
| V-4 | Overlap | Popup, panels, legend, time bar never overlap each other; popup never covers its marker |
| V-5 | Globe visibility | Desktop with a panel open: globe region ≥60% of viewport width; mobile: Moon visible above sheets |
| V-6 | Contrast | Token pairs ≥4.5:1 normal text, ≥3:1 large/UI (axe or a contrast checker on the screenshots) |
| V-7 | Focus & layering | Visible focus ring on every control; Esc closes the top-most layer only |
| V-8 | Markers | ≥24 px hit area; distinguishable by shape without colour; selection ring visible on lit and dark terrain |
| V-9 | States | Loading, per-site data-unavailable, out-of-range time, WebGL-off, assistant error - each rendered + screenshotted |
| V-10 | Required labels | "not to scale", "Sun direction", "terrain-aware", smooth-reference and DEM-source captions present |
| V-11 | Panorama on mobile | Readable at 375 px via horizontal scroll inside the card; no page-level horizontal scroll |

Defect log fields: ID · screen/state · viewport · severity (S1 blocks demo / S2 visible /
S3 polish) · screenshot path · fix · re-check result. File per pass: `qa/reports/visual-pass-N.md`.

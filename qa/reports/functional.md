# Functional review (F-01..F-06)

Date: 2026-11-14, dev server + first production build, embedded Chromium.
Driven by real clicks (plus the user's own live exploration of the dev build during review).

| ID | Flow | Result | Evidence |
|---|---|---|---|
| F-01 | Select a site from the globe and from the Sites drawer; hover tooltips; far-side markers dimmed | PASS - selection via drawer and markers both open the popup with correct values; one automation mis-click (stale ref) selected Apollo 12 and correctly showed the context-site popup without analysis claims | shots 02, 05; drawer flow in session log |
| F-02 | Popup -> "View more information" -> close -> reselect | PASS - panel opens with location/sky/countdowns/stats/sources; popup hides while the panel is open (fix during pass); close + reselect shows fresh values | shots 03, 04, 06 |
| F-03 | Time: Live ticking, Set date/time (valid + invalid + out-of-range), -1d/-1h/+1h/+1d, scrubber drag, arrow keys | PASS - Live follows real UTC; invalid strings produce the explanatory error; out-of-window times clamp with the window message; scrubber and buttons update popup, panorama and countdowns consistently (user-driven checks included) | shots 02 vs 05 (time changes), timebar visible in all shots |
| F-04 | Compare: add 2 sites, panel updates with time, remove buttons | PASS - both columns at the shared time with terrain + smooth values; third-add replacement logic implemented (not exercised: only 2 analysed sites exist) | shot 07 |
| F-05 | Error states: missing site JSON; WebGL off | PASS (2026-11-14 follow-up) - ephemeris/im1.json temporarily removed on the dev server: popup showed the designed "Sun/Earth data unavailable" card; the error text was improved to "data file missing: ..." (SPA-fallback detection added in loaders); after restoring the file, **Retry** recovered to live values. WebGL-off exercised via the `?nowebgl=1` test hook: warning + static map + working panels. | session screenshots; code: loaders.ts, App.tsx |
| F-06 | Core app without the assistant / without a key / offline | PASS - assistant closed by default and fully optional; production build makes zero external requests (network log check); key screen never blocks the rest of the UI | network check in session log; shot 08 |
| A-02 | Keyboard-only walkthrough | PASS (2026-11-14 follow-up, no mouse): Tab→"Sites"→Enter opened the drawer with focus on the first site; Tab→Enter selected IM-1 (drawer auto-closes - new behaviour); popup's "View more information" activated by Enter opened the panel; Esc closed the panel (popup returned); second Esc deselected; ←/Shift+← moved time exactly −1 h/−1 d (06:48 → 11-13 05:48). Minor note: after the drawer closes, focus falls to the page body rather than the popup's first button (one Tab away) - logged S3. | activeElement traces in session log |

401 smoke test (assistant wiring): PASS - see `ai-security.md`.

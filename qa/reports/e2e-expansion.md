# E2E verification - 14-site expansion, Sun/Earth models, star background

Date: 2026-11-15 (ICT). Target: the local production build (`npm run build` + `vite preview`,
http://localhost:4173). Not deployed; nothing pushed.

## Commands run

| Command | Result |
|---|---|
| `npx vitest run` | 4 files, **64 tests PASS** |
| `npx tsc --noEmit -p .` and `npm run build` | **PASS** (one Vite bundle-size advisory only) |
| `npx tsx scripts/validate/validate-data.ts --online` | **128 checks: 106 PASS, 22 INFO, 0 FAIL** (`qa/reports/validate-online.txt`) |
| `node qa/e2e/run-e2e.mjs` (headless Chrome via DevTools protocol) | **50 PASS, 0 FAIL, 5 INFO** (`qa/reports/e2e-results.json`, `e2e-console.txt`) |
| Secret scan of the repo (key patterns, `.env`, storage APIs) | **PASS**: no credentials; the only hit is the placeholder `sk-ant-invalid-...` in `ai-security.md` |

## Required flows

| # | Flow | Result | Evidence |
|---|---|---|---|
| 1 | App starts and opens; 3D view ready | PASS: ready in 1.7-2.5 s (headless software rendering) | `d1440-01`, `d1280-01`, `m375-01` |
| 2 | Every site appears and is selectable | PASS: 14/14 in the list (desktop and mobile); all 14 opened in the earlier pass with popup values within 0.006° of an independent recomputation | `d1440-02`, `m375-02` |
| 3 | Popup and panel show data, terrain horizon, sources, units, limitations | PASS: "Terrain data", "Resolution check", panorama, Sources and Limitations present | `d1440-03/04`, `m375-03/04` |
| 4 | Changing time at several points updates Sun/Earth data, illumination, horizon view and 3D directions consistently | PASS at 4 times (2026-12-03 06:00, 2027-03-15 18:30, 2027-08-20 02:00, 2027-10-31 23:00): rendered Earth model, Sun model and light direction vs the sub-Earth/sub-solar ephemeris, angle error **0.0000°**; popup within 0.0022° | `time-01`, `e2e-results.json` (scenario `time`) |
| 5 | Compare two sites: both update together | PASS: IM-2 and Apollo 17 columns (Sun elevation, horizon at Sun azimuth, Earth elevation, sunlit) match the recomputation at all 4 times, max diff 0.0049° (display rounding 0.005°) | `d1440-05`, scenario `time` |
| 6 | Stars never obscure Moon, markers, labels or controls | PASS: hit-test of every control/panel centre lands on the control, never the canvas (15-16 elements desktop, 11 mobile); stars render behind the Moon (no depth write); visual check | `*-06-sun-earth-view`, `m375-05` |
| 7 | Desktop and mobile layouts, loading and error states | PASS at 1440×900, 1280×720 and 375×812 (mobile emulation, DPR 2): no horizontal page scroll; time bar, popup and panels inside the viewport. Slow-network initial loading and per-site loading messages shown; a forced 404 on one site's terrain file shows a clear error with Retry, the rest of the app keeps working, and Retry recovers. `?nowebgl=1` fallback renders at both widths | `states-01..04`, `nowebgl-*` |
| 8 | Console and network | PASS: 0 console errors or exceptions; 1 warning (`THREE.Clock` deprecation, emitted inside @react-three/fiber, harmless); 0 failed local requests apart from the deliberate 404; **0 external requests** (128 requests, all same-origin) | `e2e-results.json` |
| AI | UI → assistant flow (mock provider) | PASS: TEST MODE label; explain-site, compare and safety refusal; invented number flagged; no provider request. **Real-provider test PENDING** (needs the user's key in the deployed app) | `mockai-01`, `ai-eval.md` |

Performance note: before any site is opened the app transfers about 1.9 MB (Moon texture,
fonts, app bundle, geocentric series). Each site's data (≈0.6 MB ephemeris + mask + events)
loads only when that site is selected or compared, then stays cached.

## Defects found and fixed during this run

| Defect | Fix |
|---|---|
| Sun & Earth view: the Sun model could sit off-screen. Camera easing was per-frame, so slow devices had not arrived; and on portrait phones no distance under 7 fits both models | Frame-rate-independent easing; view distance chosen from the screen aspect ratio (6.2 on landscape, up to 19 on portrait), zoom-out limit raised to match (`coords3d.ts`, `MoonScene.tsx`) |
| Popup source chip said "LOLA DEM" for SLDEM2015 sites; panorama caption and About text named LOLA only | Chip and caption follow the mask's `terrainFamily`; About text names both products |
| Number guard flagged the "2015" in "SLDEM2015" as an unsupported number | Digits glued to a preceding letter (product names, source ids) are skipped; regression test added |
| Mobile: the time bar covered the bottom of the detail panel and site list | Bottom sheets sit above the time bar while open |
| A model's caption stayed visible when the Moon hid the model | Caption hidden when the Moon blocks the line of sight |
| Sun caption overlapped the Sun's glow on desktop | Captions anchored below each model in scene space, with a faint dark backing |
| Assistant placeholder still said "Ask about IM-2 or IM-1..." | Now "Ask about any of the 14 sites..." |
| Polar masks' resolution note said "20 m within 20 km"; the code uses the 20 m layer to ±24 km | Note corrected in the script and the 3 polar masks (text only; horizon values unchanged) |

## Limitations of this verification
- Rendering ran in headless Chrome with software WebGL (SwiftShader), not a GPU; frame
  timings are therefore pessimistic and not a GPU performance measurement.
- Mobile was emulated (viewport, DPR, touch, mobile UA), not tested on a physical phone.
- The real Anthropic provider was not exercised (by design: no key). Pending.
- The visual check should be repeated on the deployed URL.

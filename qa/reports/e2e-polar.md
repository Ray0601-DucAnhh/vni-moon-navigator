# E2E: south-polar terrain map (2026-11-15)

**Harness:** `qa/e2e/run-e2e.mjs`. It runs headless Chrome (SwiftShader WebGL) over CDP against the production build (`npm run build && npm run preview`, http://localhost:4173).
**Screenshots:** `qa/screenshots/pass-4/` (full run) and `qa/screenshots/polar/` (polar-only runs).
**Full run:** 65 PASS, 0 FAIL, 5 INFO. That is every earlier scenario plus the new polar ones. Raw results are in `qa/reports/e2e-results.json` and `qa/reports/e2e-console.txt`.

## Polar scenarios

The app's values are compared with an **independent decode in the page**: the test fetches `stats.bin.gz`, gunzips it, and applies its own stereographic nearest-node formula.

| Scenario | Check | Result |
|---|---|---|
| polar-map (1440×900) | The Polar map button shows the layer card and legend once the data loads | PASS |
| | The hover readout equals the shipped value of the nearest grid node | PASS |
| | Clicking the map opens the Map-point panel | PASS |
| | The panel uses the nearest node to the clicked coordinate | PASS (node 36270 = independent) |
| | The panel's year Sunlit / Earth values equal `stats.bin` for that node | PASS (0% / 20.5%) |
| | The panel shows the panorama, operation windows, limitations and sources S34/S50/S21 | PASS |
| | The layer switch selects Earth in sight | PASS |
| | Controls and panels stay on top of the 3D canvas | PASS. The site legend is hidden while the polar card occupies the same corner |
| | Custom point (−89.30, 131.2) offers terrain analysis and opens the right node | PASS (node 47415, Sun 65.0%) |
| | No horizontal scroll | PASS |
| | The Polar map button turns the layer off | PASS |
| polar-mobile-375 | The polar card fits the viewport | PASS |
| | No horizontal scroll | PASS |
| | A touch tap on the map opens the Map-point panel | PASS (real touch event) |
| | The Map-point panel fits the viewport | PASS |
| all pages | No console errors. The only warning is three.js's own `THREE.Clock` deprecation | PASS |
| all pages | No failed or external requests | PASS |

## Bugs found by these checks and fixed

1. **The texture never reached the shader.** R3F's JSX `<shaderMaterial uniforms>` did not share the uniforms object. The material is now built with `new THREE.ShaderMaterial` in `useMemo`. This was found through `qa/e2e/debug-polar.mjs` (`data-vni-polar`: `tex=none` → `tex=301x301`).
2. **The polar card covered the site legend** in the bottom-left corner. The legend is now hidden while the map is on, because the card carries its own legend.
3. **Low contrast.** No node exceeds ~76% Sun, so the Sun and Both scales now stop at 80% (labelled "≥80%"). Earth stays 0–100%.
4. **Corner artefact.** The map is clipped to the 300 km disc (80°S to the pole) in the shader, and the same disc is used for lookups.

## Not covered

Real phones and GPU browsers. The runs use emulated touch and SwiftShader. Check on a real phone after deploying.

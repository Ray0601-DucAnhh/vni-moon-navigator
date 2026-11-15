# Plan: South-polar terrain map (post-hackathon upgrade)

Status: **done 2026-11-15** on branch `feature/south-pole-map` (not merged, not deployed). Validation PG-1..PG-6 all PASS; E2E 65 PASS / 0 FAIL (qa/reports/e2e-polar.md); 124 unit tests pass.
Backup taken before any change: `D:\NASA SPACE APP CHALLENGES\backups\VNI_MoonNavigator_backup_2026-11-15_before-southpole-map.tar.gz`. It holds the full project with `.git`; only `node_modules`, `dist` and the re-downloadable DEM cache are left out.

## Why

The app analyses the 14 sites that have already landed. The places future missions target cannot be analysed, because no official coordinates exist (decision D-04). That covers the 9 Artemis candidate regions and the CLPS targets at Mons Mouton and the south pole region.

This upgrade lets the user pick **any point near the south pole** and get a terrain-aware Sun/Earth analysis. A heat map shows where light and Earth visibility are good. The app still never invents coordinates for named regions.

## What the user gets

1. **Polar map layer** on the globe: a heat map from 80°S to the pole (disc of radius 300 km; the square grid's corners are computed but not offered). The user picks one of three layers:
   - "Sunlit %": time the Sun's centre is above the terrain horizon.
   - "Earth in sight %": time the Earth's centre is above the terrain horizon (geometric only).
   - "Both %": both at once.

   Each layer comes with a legend.
2. **Click anywhere on the map** to open a Map-point panel. It shows:
   - The grid node used, with its exact coordinates and its distance from the click.
   - Current Sun and Earth positions, and the horizon panorama.
   - Year statistics.
   - Next Sun and Earth events.
   - The existing "Find operation windows" tool.
3. **Custom point**: a typed coordinate inside the map area gets a button that opens the same terrain-aware analysis. It used to get only the flat-horizon (Level A) result.

## Method (Level B-grid)

| Item | Choice | Reason |
|---|---|---|
| Grid | South polar stereographic (same projection as PGDA LOLA), node spacing 2 km, \|x\|,\|y\| ≤ 300 km → 301 × 301 = 90,601 nodes | Stays inside the local 80 m DEM box (±304 km) |
| Terrain | `LDEM_80S_80MPP_ADJ` (80 m) inside the box, `LDEM_60S_240MPP_ADJ` (240 m) beyond (S34). Both are fully cached locally | No downloads needed |
| Observer | 2 m above the DEM surface | Same as the 14 sites |
| Horizon | 360 azimuths (1°). Ray samples every 80 m to 8 km, then step = 1% of distance, to 300 km | Same range as the site masks. Time budget about 15 G samples, run on 12 worker threads |
| Storage | Masks as uint8: el = v/10 − 5 (−5.0…+20.5°, step 0.1°). Stored in 100 chunks of 31 × 31 nodes, gzip | Above 20.5° the horizon blocks the Sun and Earth anyway at these latitudes (measured max: Sun 15.5°, Earth 17.5° — PG-5) |
| Sun/Earth | `skyAt` (sub-solar/sub-Earth points from JPL Horizons, the shipped `moon-geocentric.json`). Already validated against per-site Horizons topocentric values (SV-6) | One shared engine for app and pipeline |
| Year statistics | Hourly, 2026-11-01 → 2027-11-01. Sunlit = disc centre above the horizon (same rule as the sites). Earth = centre above the horizon. Also the longest no-Sun period (h) | Same definitions as the site analysis |

**Limits (shown in the UI):**
- The 2 km node spacing and 80 m DEM make this a regional comparison only. It is not a landing-safety or site-level result.
- The 14 analysed sites use 20 m / SLDEM terrain at 0.1° and stay the reference.
- The map uses the nearest node. Horizons are not interpolated between nodes, because that has no physical meaning.

## Steps

1. Backup and branch. **Done**

Steps 2-6 below are **done**; results: qa/reports/polar-validation.md, qa/reports/e2e-polar.md.
2. Pipeline `scripts/terrain/build-polar-grid.ts` with worker threads. It writes `public/data/polar/meta.json`, `stats.bin` (per node: sunlit, Earth, both, longest dark, DEM height) and `masks/c_<i>_<j>.bin.gz`. It also adds a manifest entry and an `npm run data:polar` script.
3. Validation `scripts/validate/validate-polar.ts`, written to `qa/reports/polar-validation.md`:
   - **PG-1:** the grid method run exactly at IM-1 and IM-2 vs the published 20 m site masks. Report horizon RMS and maximum difference, plus year sunlit/Earth fractions.
   - **PG-2:** nearest-node vs site, reported for spatial representativeness.
   - **PG-3:** the stats engine with a flat horizon must equal the smooth-Moon reference.
   - **PG-4:** sanity: crater-floor nodes near the pole (e.g. Shackleton floor) show 0% Sun; the brightest nodes are on rims and ridges.
   - **PG-5:** check that no horizon value is clamped where the Sun or Earth could be above it.
   - **PG-6:** encode/decode round trip.
4. App:
   - Loader and decoder (`services/data/polar.ts`).
   - Globe overlay shader layer (`features/globe/PolarMapLayer.tsx`).
   - Layer switcher and legend.
   - Map-point panel (`features/polar/MapPointPanel.tsx`), reusing `HorizonPanorama`, `WindowFinder` and the core science.
   - Custom-point button.
   - Store state.
5. Tests:
   - vitest for the decoder, the node lookup, PG checks on the shipped data, and consistency of panel stats vs the precomputed stats.
   - E2E: extend `qa/e2e` (headless Chrome over CDP). Toggle the layer, click the map, check the panel values against `stats.bin` for that node, check no console errors, check the mobile layout.
6. Docs: methods, README, HANDOFF, CREDITS/sources, About dialog text, workbook decision note.

## Rollback

`git checkout main` returns to the pre-upgrade app (branch work is separate), or restore the tar.gz above.

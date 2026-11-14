# Terrain-horizon validation (TV series)

Run 2026-11-14 by `npm run data:validate -- --online`; machine-readable results in
`data-raw/validation/validation-results.json`. Tests follow plan v1.1 §4.3.
DEM source: PGDA "A New View of the Lunar South Pole from LOLA" (S34; Barker et al. 2023,
PSJ 4:183; data DOI 10.60903/gsfcpgda-lola-spole). All files verified by SHA-256 against
`public/data/manifest.json`.

| ID | Test | Result | Status |
|---|---|---|---|
| TV-1 | IM-1 site height, 20 m DEM bilinear vs LROC-published 2,579 m | DEM 2,592 m -> **+13 m** (tolerance ±50 m). Also run on the 80 m grid during feasibility: +13 m. | **PASS** |
| TV-2 | Synthetic flat DEM (500 m) through the full marcher | Horizon = smooth-sphere dip −0.0869° at every sampled azimuth within 0.002° (`tests/science.test.ts`) | **PASS** |
| TV-3 | Synthetic Gaussian mountain (1,500 m, σ=800 m, 10 km north) | Marcher peak elevation matches an independent 1-D chord-formula scan within 0.02°; flat dip restored away from the mountain | **PASS** |
| TV-4 | Independent recomputation of the exported horizon-forming points (3 azimuths/site) via the chord formula | max diff **0.00009°** (IM-2), **0.00017°** (IM-1); tolerance 0.01°. Exported point scalars (lat, lon, height, distance) are inside each mask JSON (`tv4`) for a manual spreadsheet re-check. | **PASS** |
| TV-5 | Near-field resolution sensitivity (20 m window vs 80 m only) | IM-2: max 0.065°, RMS 0.011°. IM-1: max **0.408°**, RMS 0.102° (rough crater terrain). RMS target ≤0.2° met for both; IM-1's larger sensitivity is reflected in its in-app uncertainty note. | **PASS** |
| TV-6 | Ray range sensitivity 300 km vs 150 km and vs 500 km | **0.0000°** change in every bin (both sites, both directions, at 4-decimal mask precision). Distant terrain beyond 150 km does not form these horizons; 300 km default kept with margin. | **PASS** |
| TV-7 | Independent cross-check against the published PSR product: point (−89.66°, 129.2°E) inside Shackleton with `LPSR_80S_20MPP_ADJ` flag = 1 (flag 0 at IM-2) | Our pipeline: max Sun clearance **−18.30°** over 8,761 hourly samples across the full year -> never sunlit, agreeing with the published permanently-shadowed classification | **PASS** |
| TV-8 | IM-1 coordinate-uncertainty sensitivity: masks recomputed at ±300 m N/S/E/W (published precision 0.01°) | Horizon changes by up to **4.26°** in some azimuth bins (site sits in a degraded crater on ~12° slopes; DEM heights at the offsets span ~2,560–2,680 m) | **INFO** - surfaced as a limitation in the IM-1 panel and the About dialog |
| TV-9 | Qualitative silhouette check vs LROC QuickMap | Done 2026-11-14: side-by-side figure `figures/tv9-im1-pair.png`. The mask's high NE→S skyline (9-11°, peak 11.1° at az 149°) matches the bright massif/rim terrain east-southeast of the IM-1 marker in QuickMap, and the low W-NW horizon (1-2.6°) matches the smoother terrain west of it. Qualitative agreement of the major features. | **PASS** (qualitative) |
| TV-10 | App functions vs derived files at 12 random instants/site | 0 mismatches (also structurally guaranteed: pipeline and app import the same TypeScript science core) | **PASS** |

Pipeline parameters: 3,600 azimuths (0.1°); 10 m steps to 20 km, 40 m steps to 300 km;
observer +2 m; mosaic 20 m (±25 km window) → 80 m (80°S grid) → 240 m (60°S grid);
0 NaN samples for both sites. Site DEM heights: IM-2 5,321.9 m (EFFRES ≈ 17 m),
IM-1 2,592.0 m (EFFRES ≈ 49 m).

## Interpretation
The two independent recomputation paths (TV-3, TV-4), the synthetic analytic case (TV-2),
the external LROC elevation (TV-1) and the external PSR product (TV-7) check different parts
of the chain (projection, decoding, marching, geometry). The remaining dominant uncertainties
are the DEM's effective resolution near each site and IM-1's published-coordinate precision
(TV-8), both shown in the app.

# Terrain-horizon validation (TV series)

Run 2026-11-15 by `npm run data:validate -- --online` (128 checks: 106 PASS, 22 INFO,
0 FAIL); machine-readable results in `data-raw/validation/validation-results.json`.
Tests follow plan v1.1 §4.3, extended to all 14 coordinate-verified landed sites.

## DEM sources, coverage and resolution per site

Two authoritative LOLA-based products are used, chosen by latitude (`terrainFamily` in
each mask, shown in the site panel as "Terrain data"):

- **LOLA south-polar DEMs** (S34; PGDA "A New View of the Lunar South Pole from LOLA",
  Barker et al. 2023, PSJ 4:183, DOI 10.60903/gsfcpgda-lola-spole). Polar stereographic,
  MOON_ME/DE421. Per-site effective resolution is read from the product's own EFFRES layer.
- **SLDEM2015** (S33; LOLA + SELENE Terrain Camera, Barker et al. 2016, Icarus 273:346;
  PGDA product 54). Simple cylindrical, "mean Earth/polar axis of DE421", heights in km
  relative to 1,737.4 km. Coverage ±60° latitude. 512 pixels/degree tiles near the site,
  the 128 pixels/degree global file beyond. Read with HTTP range requests; the reader is
  unit-tested for georeferencing, the 0/360° seam and window bounds (`tests/sldem.test.ts`).

| Site | Lat, lon (°) | Family | Near field | Far field | Site DEM height |
|---|---|---|---|---|---|
| IM-2 Athena | −84.7906, 29.1957 | polar80 | LOLA 20 m (EFFRES 17.1 m), ±24 km | 80 m to 80°S grid edge, then 240 m | 5,321.9 m |
| IM-1 Odysseus | −80.13, 1.44 | polar80 | LOLA 20 m (EFFRES 48.7 m), ±24 km | 80 m, then 240 m | 2,592.0 m |
| Chandrayaan-3 | −69.3741, 32.32 | polar60 | LOLA 60 m (EFFRES 30.8 m), ±24 km | 240 m (60°S grid) | 529.3 m |
| Apollo 11 | 0.67416, 23.47314 | sldem | 512 ppd (59 m N-S × 59 m E-W), ±25 km | 128 ppd (~237 m) to 310 km | −1,930.0 m |
| Apollo 12 | −3.0128, −23.4219 | sldem | 512 ppd (59 × 59 m) | 128 ppd | −1,424.9 m |
| Apollo 14 | −3.64589, −17.47194 | sldem | 512 ppd (59 × 59 m) | 128 ppd | −1,063.3 m |
| Apollo 15 | 26.13239, 3.6333 | sldem | 512 ppd (59 × 53 m) | 128 ppd | −1,927.9 m |
| Apollo 16 | −8.9734, 15.5011 | sldem | 512 ppd (59 × 59 m) | 128 ppd | 11.2 m |
| Apollo 17 | 20.1911, 30.7723 | sldem | 512 ppd (59 × 56 m) | 128 ppd | −2,628.0 m |
| Blue Ghost 1 | 18.5623, 61.8103 | sldem | 512 ppd (59 × 56 m) | 128 ppd | −3,651.5 m |
| SLIM | −13.316, 25.251 | sldem | 512 ppd (59 × 58 m) | 128 ppd | −912.4 m |
| Chang'e 4 | −45.457, 177.589 | sldem | 512 ppd (59 × 42 m) | 128 ppd | −5,927.6 m |
| Chang'e 5 | 43.0576, −51.9161 | sldem | 512 ppd (59 × 43 m) | 128 ppd | −2,544.1 m |
| Chang'e 6 | −41.6385, −153.9852 | sldem | 512 ppd (59 × 44 m) | 128 ppd | −5,256.2 m |

COVERAGE check: all 14 sites have ephemeris + horizon + derived files and manifest entries;
every ray sample fell inside a DEM layer (0 NaN samples at every site).

## Results

| ID | Test | Result | Status |
|---|---|---|---|
| TV-1 | Site DEM height vs LROC-published elevation, wherever a source publishes one (tolerance ±50 m) | IM-1 +13.0 m · Blue Ghost 1 −1.5 m · Chandrayaan-3 −2.7 m · SLIM −0.4 m · Chang'e 5 +25.9 m · Chang'e 6 −0.2 m. The other 8 sources publish no elevation (panel says so). | **PASS** (6/6) |
| TV-2 | Synthetic flat DEM through the full marcher | Smooth-sphere dip −0.0869° at every azimuth within 0.002° | **PASS** |
| TV-3 | Synthetic Gaussian mountain | Matches an independent 1-D chord-formula scan within 0.02° | **PASS** |
| TV-4 | Independent chord-formula recomputation of exported horizon points (3 azimuths/site) | max diff 0.00003° (CH3) … 0.00705° (CE5); tolerance 0.01° | **PASS** (14/14) |
| TV-5 | Near-field resolution sensitivity (near window removed; coarser layer only) | See table below | 7 PASS, 7 INFO |
| TV-6 | Ray range 300 km vs 150 km (all sites); 300 vs 500 km (polar sites) | 0.0000° change in every bin at every site | **PASS** / INFO |
| TV-7 | Shackleton-interior point flagged permanently shadowed in `LPSR_80S_20MPP_ADJ` | Max Sun clearance −18.30° over 8,761 hourly samples: never sunlit | **PASS** |
| TV-8 | IM-1 ±300 m coordinate sensitivity | Up to 4.26° in some azimuth bins | **INFO** (shown in IM-1 panel) |
| TV-9 | Qualitative silhouette vs LROC QuickMap (IM-1) | `figures/tv9-im1-pair.png`, major features agree | **PASS** (qualitative) |
| TV-10 | App functions vs derived events, 12 random instants/site | 0 mismatches at all 14 sites | **PASS** |
| TV-11 | Terrain-aware year sunlight ≤ smooth-Moon sunlight (unless the horizon dips below 0°) | Holds at all 14 sites (e.g. IM-1 38.1% vs 49.2%, Apollo 15 46.1% vs 48.9%) | **PASS** (14/14) |

### TV-5 near-field resolution sensitivity (shown in each panel as "Resolution check")

| Site | Compared with | RMS | Max | Status |
|---|---|---|---|---|
| IM-2 | 80 m only | 0.011° | 0.065° | PASS |
| IM-1 | 80 m only | 0.102° | 0.408° | PASS |
| Chandrayaan-3 | 240 m only | 0.065° | 0.264° | PASS |
| SLIM | 128 ppd only | 0.067° | 0.347° | PASS |
| Apollo 17 | 128 ppd only | 0.058° | 1.868° | PASS |
| Chang'e 4 | 128 ppd only | 0.161° | 0.741° | PASS |
| Apollo 15 | 128 ppd only | 0.192° | 0.694° | PASS |
| Apollo 14 | 128 ppd only | 0.302° | 0.947° | INFO |
| Chang'e 6 | 128 ppd only | 0.471° | 1.350° | INFO |
| Apollo 12 | 128 ppd only | 0.779° | 2.032° | INFO |
| Chang'e 5 | 128 ppd only | 0.831° | 2.136° | INFO |
| Apollo 16 | 128 ppd only | 0.875° | 2.176° | INFO |
| Blue Ghost 1 | 128 ppd only | 0.934° | 2.967° | INFO |
| Apollo 11 | 128 ppd only | 1.380° | 2.765° | INFO |

INFO here is not a failure: on flat mare plains the horizon is only 0–3° high and is set by
small craters within ~25 km, which the ~237 m layer cannot resolve, so removing the 59 m
layer changes it a lot. Site heights from the two resolutions agree within 3.4 m, which rules
out a registration error. The value is shown next to the terrain data in each panel, with a
caution when RMS > 0.2°, and listed as a limitation in "About the data".

TV-6 note: the 300 → 500 km variant was run for the polar sites only; for SLDEM sites the far
window is cached to 310 km, and TV-6 (300 vs 150 km) already shows that nothing beyond
150 km forms any of these horizons.

Pipeline parameters (all sites): 3,600 azimuths (0.1°); 10 m steps to 20 km, 40 m steps to
300 km; observer +2 m above the DEM surface.

## Interpretation
The independent recomputation paths (TV-3, TV-4), the synthetic case (TV-2), the external
LROC elevations at six sites spanning both DEM families (TV-1), the external PSR product
(TV-7) and the physical sanity bound TV-11 check different parts of the chain. The remaining
dominant uncertainties are DEM effective resolution near each site (TV-5, largest on
flat mare sites) and IM-1's published-coordinate precision (TV-8). Both are shown in the app.

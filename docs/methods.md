# Scientific methods

Conventions: planetocentric latitude/longitude in the Moon's mean Earth/polar axis frame
(MOON_ME; DE421-aligned realisation), longitude east-positive −180..180; heights in metres
relative to the 1,737,400 m reference sphere; times UTC; azimuth clockwise from local north;
elevation relative to the local horizontal plane; airless (no refraction) throughout.

Everything below is implemented once, in `src/services/science/core.ts` and
`src/lib/coords.ts`, and shared verbatim by the app UI, the AI assistant's tools and the
offline pipeline, so all surfaces agree by construction (verified by TV-10).

## 1. Sun & Earth positions (JPL Horizons)
`scripts/ephemeris/fetch-horizons.ts` requests apparent azimuth/elevation (QUANTITIES=4)
of the Sun (10) and Earth (399) for an observer at each site
(`CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lonE,lat,alt_km'`,
alt = site DEM height + 2 m), every 30 minutes from 2026-11-01 to 2027-11-01, plus the
geocentric sub-Earth/sub-solar points (QUANTITIES=14,15, hourly) that drive the globe's
lighting and Earth-direction arrow. Headers are asserted (frame, radius, AIRLESS, echoed
coordinates) and raw responses kept verbatim in `data-raw/horizons/`.
At display time values are linearly interpolated (azimuth along the shorter arc);
measured interpolation error ≤0.0001° elevation on a sampled day (SV-3).

## 2. Terrain horizon masks (LOLA DEMs)
`scripts/terrain/build-horizon-masks.ts` computes, for 3,600 azimuths per site, the maximum
elevation angle of terrain along the great circle:

- Observer `O = (R + h_site + 2 m) · û(site)`.
- Sample points every 10 m to 20 km, then every 40 m to 300 km; each sample's position is
  rotated along the great circle (no per-sample trigonometry: `û_P = û_O cos σ + t̂ sin σ`)
  and projected to south-polar stereographic (`x = 2R·u_y/(1−u_z)`, `y = 2R·u_x/(1−u_z)`).
- Heights come from a bilinear mosaic: 20 m/pixel DEM within a ±25 km window of the site
  (HTTP range reads of the cloud-optimised GeoTIFF), 80 m to the edge of the 80°S grid,
  240 m beyond (60°S grid).
- Elevation of a sample: `el = asin( ((P−O)·û_O) / |P−O| )` with `P = (R+h)·û_P`
  — lunar curvature is inherent; no refraction.
- `H(az) = max el` along the ray, with the distance to the horizon-forming point retained.

The reader for the NASA GeoTIFFs (BigTIFF, tiled, DEFLATE, floating-point predictor) is
purpose-built (`scripts/lib/bigtiff.ts`) and verified against the LROC-published IM-1
elevation (+13 m, TV-1) and synthetic analytic cases (TV-2/3/4).

## 3. States, events and statistics
- **Sunlit (terrain-aware)**: visible fraction of the solar disc
  `f = 1 − (acos x − x√(1−x²))/π`, `x = clip((el☉ − H(az☉))/ρ☉, −1, 1)`, ρ☉ = 0.26645°
  (IAU 2015 nominal radius at 1 au; straight-horizon-across-the-disc approximation).
  "Sunlit" = f ≥ 0.5, i.e. disc centre above the terrain horizon.
- **Earth visible**: `el⊕ ≥ H(az⊕)` for the Earth's **centre** — geometric line of sight
  only, never a statement about radio-link availability.
- **Smooth-Moon reference**: the same tests against a 0° horizon (local horizontal plane,
  matching Horizons' elevation reference), displayed beside terrain-aware values so the
  terrain effect is visible. (The dip of a locally smooth sphere for a 2 m observer,
  −0.087°, is stored in each mask as `smoothRefDeg` for reference.)
- **Events**: zero-crossings of clearance, scanned every 10 minutes and bisected to ≤30 s
  (`scripts/derive/build-derived.ts`); events shorter than 10 minutes can be missed.
- **Windows/statistics**: 10-minute sampling (30-day and daily aggregates; longest dark
  spell is the longest contiguous not-sunlit run).

## 4. Known limitations
See the in-app "About the data" dialog (`src/content/text.ts`, LIMITATIONS) — notably:
DEM effective resolution (≈17 m at IM-2, ≈49 m at IM-1); sub-resolution rocks/craters and
the lander itself unmodelled; single 2 m observer height; IM-1's ±300 m coordinate
precision shifting parts of its horizon by up to ~4.3° (TV-8); Earth treated as a point
(its ~0.95° disc is not partially tracked); texture shading illustrative.

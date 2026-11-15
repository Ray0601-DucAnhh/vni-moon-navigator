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
lighting and the 3D Sun/Earth model directions. Headers are asserted (frame, radius, AIRLESS, echoed
coordinates) and raw responses kept verbatim in `data-raw/horizons/`.
At display time values are linearly interpolated (azimuth along the shorter arc);
measured interpolation error ≤0.0001° elevation on a sampled day (SV-3).

## 2. Terrain horizon masks (LOLA south-polar DEMs and SLDEM2015)
`scripts/terrain/build-horizon-masks.ts` computes, for 3,600 azimuths per site, the maximum
elevation angle of terrain along the great circle:

- Observer `O = (R + h_site + 2 m) · û(site)`.
- Sample points every 10 m to 20 km, then every 40 m to 300 km; each sample's position is
  rotated along the great circle (no per-sample trigonometry: `û_P = û_O cos σ + t̂ sin σ`)
  and handed to a height sampler as a unit vector, so one marcher serves both DEM families.
- Heights come from a bilinear mosaic chosen by latitude (`terrainFamily`):
  - **polar80** (lat ≤ −79.9°: IM-2, IM-1): LOLA 20 m/pixel within ±24 km of the site
    (HTTP range reads of the cloud-optimised GeoTIFF), 80 m to the edge of the 80°S grid,
    240 m beyond (60°S grid); south-polar stereographic
    (`x = 2R·u_y/(1−u_z)`, `y = 2R·u_x/(1−u_z)`).
  - **polar60** (lat ≤ −60°: Chandrayaan-3): LOLA 60 m/pixel within ±24 km, 240 m beyond.
  - **sldem** (|lat| < 60°: the other 11 sites): SLDEM2015 512 pixels/degree (≈59 m N-S)
    within ±25 km, the 128 pixels/degree global file (≈237 m) to 310 km; simple cylindrical,
    pixel-registered, heights in km above 1,737.4 km, 0/360° seam handled.
  Both products use the mean Earth/polar axis frame of DE421, the frame of the site
  coordinates.
- Elevation of a sample: `el = asin( ((P−O)·û_O) / |P−O| )` with `P = (R+h)·û_P`
  — lunar curvature is inherent; no refraction.
- `H(az) = max el` along the ray, with the distance to the horizon-forming point retained.

The reader for the NASA GeoTIFFs (BigTIFF, tiled, DEFLATE, floating-point predictor) is
purpose-built (`scripts/lib/bigtiff.ts`); the SLDEM2015 reader (`scripts/lib/sldem.ts`) reads
raw float32 rows by HTTP range. Both are verified against LROC-published elevations at six
sites (−2.7 to +25.9 m, TV-1), synthetic analytic cases (TV-2/3/4) and unit tests.

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
- **Operation windows** (temporal feasibility, `src/services/science/planning.ts`, panel section
  "Find operation windows", assistant tool `find_operation_windows`): intervals in which every condition the
  user picks holds at once (Sun disc centre above the terrain horizon by >= a chosen clearance; Earth centre
  above it), lasting at least a chosen number of hours. Edges come from the same 10-minute scan + bisection to
  30 s as the sunrise/sunset events, so they agree with the countdowns (unit-tested: Sun-only windows reproduce
  the shipped events minute for minute). Windows cut by the 2026-11-01 → 2027-11-01 data range are marked ≤ / ≥.
- **Event-time ±**: each countdown shows ±N min = the event recomputed with the terrain horizon raised and
  lowered by the site's TV-5 RMS resolution sensitivity δ (rough estimate, not a confidence interval; SV-7).
- **Windows/statistics**: 10-minute sampling (30-day and daily aggregates; longest dark
  spell is the longest contiguous not-sunlit run).

## 4. Known limitations
See the in-app "About the data" dialog (`src/content/text.ts`, LIMITATIONS) — notably:
DEM effective resolution (≈17 m at IM-2, ≈49 m at IM-1, ≈31 m at Chandrayaan-3, ≈59 m for
SLDEM2015 sites, where TV-5 shows low mare horizons are sensitive to it); sub-resolution rocks/craters and
the lander itself unmodelled; single 2 m observer height; IM-1's ±300 m coordinate
precision shifting parts of its horizon by up to ~4.3° (TV-8); Earth visibility defined by the Earth's centre (the popup also shows the visible fraction of the
~0.95°-radius Earth disc near the horizon, display only); texture shading illustrative.

## 5. Illustrative 3D Sun and Earth models
The globe shows a small Sun and Earth. Their **directions** are computed: each model lies
along the Moon-centred unit vector to the sub-solar / sub-Earth point at the selected time
(the same Horizons series that lights the globe; `src/features/globe/SunEarthModels.tsx`).
Their **sizes and distances are not to scale**, and each carries an on-screen "direction
computed / not to scale" caption. A model fades when it would cover the Moon, and its caption
hides when the Moon blocks it. The E2E suite checks the rendered directions against the
ephemeris at four times (angle error 0.0000°). The background stars are decorative (a seeded
random field), not a star map.

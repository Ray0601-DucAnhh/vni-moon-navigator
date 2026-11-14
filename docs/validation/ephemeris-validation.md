# Ephemeris validation (SV series)

Run 2026-11-14 by `npm run data:validate -- --online`; machine-readable results in
`data-raw/validation/validation-results.json`. Source: JPL Horizons API (S21/S22/S50),
DE441, apparent (airless) topocentric azimuth/elevation, MEAN_ME site frame.

| ID | Test | Result | Status |
|---|---|---|---|
| SV-1 | Header assertions on all 20 saved raw responses: lunar body-fixed frame (MEAN_ME; MOON_ME for the geocentric series), radius 1737.4 km, `Atmos refraction: NO (AIRLESS)` for topocentric series, site coordinates echoed to ≤0.001° | 20 files, 0 bad (also enforced at fetch time - a fetch aborts on any failed assertion) | **PASS** |
| SV-2 | Spot re-queries: 2 stored instants × Sun+Earth × both sites re-requested as single-instant Horizons calls | max diff **0.00005°** (tolerance 0.01°; stored values are rounded to 4 decimals) | **PASS** |
| SV-3 | Interpolation error: one full day (2027-03-01) of 10-minute Horizons Sun samples for IM-2 vs linear interpolation of the stored 30-minute series | max elevation diff **0.0001°** (target ≤0.05°); max azimuth diff 0.0000° that day | **PASS** |
| SV-4 | Sub-solar point vs NASA SVS dial-a-moon at 3 instants | max diff **0.000°** (tolerance 0.2°). Note: dial-a-moon serves the current year's product only - its 2027 responses return a frozen default (checked 2026-11-14), so all three instants are within Nov-Dec 2026. | **PASS** |
| - | Series continuity | Quarter-chunked fetches are deduplicated at seams and asserted gap-free at exactly 30-minute spacing (17,521 samples/series, 2026-11-01 → 2027-11-01) | **PASS** (build-time assertion) |

Derived-event parameters: clearance zero-crossings scanned at 10-minute steps, bisected to
≤30 s, rounded to the minute; events shorter than 10 minutes can be missed (shown as a
limitation). Full-year terrain-aware means: IM-2 sunlit 43.9%, Earth-visible 80.1%
(29 sun / 27 earth events); IM-1 sunlit 38.1%, Earth-visible 100.0% (25 sun / 0 earth events).

Solar disc: angular radius 0.26645° from the IAU 2015 nominal solar radius (695,700 km,
printed in the Horizons header) at 1 au; the ±1.7% annual range variation (±0.005°) is
neglected and documented.

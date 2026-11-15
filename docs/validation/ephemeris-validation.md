# Ephemeris validation (SV series)

Run 2026-11-15 by `npm run data:validate -- --online`; machine-readable results in
`data-raw/validation/validation-results.json`. Source: JPL Horizons API (S21/S22/S50),
DE441, apparent (airless) topocentric azimuth/elevation, MEAN_ME site frame. Same time range
and sampling for every site: 2026-11-01 → 2027-11-01 UTC, 30-minute steps, 17,521 samples
per series (geocentric sub-solar/sub-Earth series hourly).

| ID | Test | Result | Status |
|---|---|---|---|
| SV-1 | Header assertions on every saved raw response (frame, radius 1737.4 km, AIRLESS, echoed site coordinates ≤0.001°) | 116 files, 0 bad (also enforced at fetch time) | **PASS** |
| SV-2 | Spot re-queries: 2 stored instants × Sun+Earth × all 14 sites as single-instant Horizons calls | max diff 0.00005° (tolerance 0.01°) | **PASS** (14/14) |
| SV-3 | Interpolation error: 10-minute Horizons day (2027-03-01) vs linear interpolation of the 30-minute series (IM-2, the fastest-changing azimuths) | max elevation diff 0.0001° (target ≤0.05°) | **PASS** |
| SV-4 | Sub-solar point vs NASA SVS dial-a-moon (3 instants, Nov–Dec 2026) | max diff 0.000° (tolerance 0.2°) | **PASS** |
| SV-5 | Independent cross-check of two Horizons products: topocentric Earth elevation vs 90° − angular distance to the geocentric sub-Earth point (difference must stay within topocentric parallax ≤0.28°); far-side sites must never see Earth | Near side: max diff 0.105° (A16) … 0.279° (IM-2) over 1,461 instants each, allowance 0.35°. Far side: CE4 Earth el −50.95…−37.72°, CE6 −51.73…−32.87°, 0 visible days | **PASS** (14/14) |
| – | Series continuity | Seams deduplicated, asserted gap-free at exactly 30 min | **PASS** (build-time) |

## SV-7 Event-time uncertainty (terrain resolution)

Each site's next Sun event after 2026-11-15 00:00 UTC, recomputed with the terrain horizon raised and lowered by
the site's TV-5 resolution sensitivity δ (RMS). Computed by `eventTimeBounds` (`src/services/science/planning.ts`),
the same function that shows "±N min" next to every countdown in the site panel. A rough estimate, not a
statistical confidence interval. Slow, grazing sunrises turn small horizon errors into long time errors.

| Site | δ (RMS) | Next Sun event (UTC) | Range with horizon ±δ (UTC) | ± |
|---|---|---|---|---|
| IM-2 Athena | 0.011° | rise 11-15 06:12 | 11-15 06:01 → 11-15 06:22 | ±11 min |
| IM-1 Odysseus | 0.102° | rise 11-19 01:21 | 11-19 00:40 → 11-19 02:03 | ±42 min |
| Apollo 11 | 1.380° | rise 11-15 01:23 | 11-14 22:40 → 11-15 04:06 | ±163 min |
| Apollo 12 | 0.779° | rise 11-19 00:26 | 11-18 22:53 → 11-19 01:59 | ±93 min |
| Apollo 14 | 0.302° | rise 11-18 16:11 | 11-18 15:35 → 11-18 16:47 | ±36 min |
| Apollo 15 | 0.192° | rise 11-17 11:30 | 11-17 11:02 → 11-17 11:58 | ±28 min |
| Apollo 16 | 0.875° | rise 11-15 19:12 | 11-15 17:27 → 11-15 20:58 | ±106 min |
| Apollo 17 | 0.058° | set 11-29 01:09 | 11-29 01:02 → 11-29 01:16 | ±7 min |
| Blue Ghost 1 | 0.934° | set 11-26 15:32 | 11-26 13:39 → 11-26 17:29 | ±115 min |
| Chandrayaan-3 | 0.065° | set 11-29 01:35 | 11-29 01:09 → 11-29 02:01 | ±26 min |
| SLIM | 0.066° | rise 11-15 09:05 | 11-15 08:57 → 11-15 09:13 | ±8 min |
| Chang'e 4 | 0.161° | set 11-17 06:48 | 11-17 06:21 → 11-17 07:16 | ±28 min |
| Chang'e 5 | 0.831° | rise 11-21 08:59 | 11-21 06:43 → 11-21 11:14 | ±136 min |
| Chang'e 6 | 0.471° | rise 11-29 16:02 | 11-29 14:44 → 11-29 17:20 | ±78 min |

## Year-mean results (terrain-aware, 2026-11-01 → 2027-11-01)

| Site | Sunlit | Earth in line of sight | Sun events | Earth events |
|---|---|---|---|---|
| IM-2 Athena | 43.9% | 80.1% | 29 | 27 |
| IM-1 Odysseus | 38.1% | 100.0% | 25 | 0 |
| Apollo 11 | 48.1% | 100.0% | 24 | 0 |
| Apollo 12 | 49.1% | 100.0% | 25 | 0 |
| Apollo 14 | 48.4% | 100.0% | 25 | 0 |
| Apollo 15 | 46.1% | 100.0% | 25 | 0 |
| Apollo 16 | 48.2% | 100.0% | 24 | 0 |
| Apollo 17 | 46.5% | 100.0% | 24 | 0 |
| Blue Ghost 1 | 48.4% | 100.0% | 24 | 0 |
| Chandrayaan-3 | 46.4% | 100.0% | 24 | 0 |
| SLIM | 46.4% | 100.0% | 24 | 0 |
| Chang'e 4 | 50.3% | 0.0% | 25 | 0 |
| Chang'e 5 | 49.2% | 100.0% | 25 | 0 |
| Chang'e 6 | 51.1% | 0.0% | 24 | 0 |

Sunlit fractions slightly above 50% at Chang'e 4/6 come from the smooth-Moon geometry
itself (their smooth-Moon references are 51.0% and 51.4%); terrain only lowers them (TV-11).
Earth visibility is geometric line of sight to Earth's centre only.

Derived-event parameters: clearance zero-crossings scanned at 10-minute steps, bisected to
≤30 s, rounded to the minute; events shorter than 10 minutes can be missed (shown as a
limitation).

Solar disc: angular radius 0.26645° from the IAU 2015 nominal solar radius at 1 au; the
±1.7% annual variation (±0.005°) is neglected and documented.

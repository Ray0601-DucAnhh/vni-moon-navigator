# South-polar grid validation (PG-1..PG-6)

Generated 2026-11-15T08:14:45.831Z by `npm run data:polar:validate`. 11 checks: 9 PASS, 0 FAIL, 2 INFO.

| ID | Check | Result | Detail |
|---|---|---|---|
| PG-1 | Grid method at exact IM-2 Athena coordinate vs published site analysis | PASS | horizon RMS 0.016°, max -0.08°, bias -0.008° (grid 80 m/1° vs site 20 m/0.1°); year Sun 43.9% vs site 43.9% (Δ 0.0 pp), Earth 80.2% vs 80.1% (Δ 0.1 pp). Targets: RMS ≤ 0.5°, /Δ/ ≤ 5 pp. |
| PG-2 | Nearest grid node to IM-2 Athena (spatial representativeness) | INFO | node 189,81 is 0.89 km away: Sun 39.5% vs site 43.9%, Earth 78.0% vs 80.1%. Differences here include real terrain change over up to 1.4 km. |
| PG-1 | Grid method at exact IM-1 Odysseus coordinate vs published site analysis | PASS | horizon RMS 0.116°, max -0.42°, bias -0.077° (grid 80 m/1° vs site 20 m/0.1°); year Sun 38.5% vs site 38.1% (Δ 0.4 pp), Earth 100.0% vs 100.0% (Δ 0.0 pp). Targets: RMS ≤ 0.5°, /Δ/ ≤ 5 pp. |
| PG-2 | Nearest grid node to IM-1 Odysseus (spatial representativeness) | INFO | node 154,0 is 0.46 km away: Sun 41.0% vs site 38.1%, Earth 100.0% vs 100.0%. Differences here include real terrain change over up to 1.4 km. |
| PG-3a | Pipeline Sun/Earth engine equals the app's skyAt | PASS | 2000 random node/time pairs: max /Δel/ 7.11e-15°, max /Δaz/ 5.68e-14° |
| PG-3b | Flat-horizon statistics equal the smooth-Moon reference | PASS | node 100,200: flat 4514/2724 vs skyAt el>0 4514/2724 hourly samples |
| PG-4 | Cabeus crater floor (IAU 953: -85.33, -42.13) is in shadow all year | PASS | nearest node 1.3 km away: Sun 0.0%, longest dark 8761 h, DEM height -3238 m |
| PG-4 | de Gerlache crater floor (IAU 1439: -88.48, -88.34) is in shadow all year | PASS | nearest node 0.7 km away: Sun 0.0%, longest dark 8761 h, DEM height -1092 m |
| PG-4 | Best-lit nodes sit on high ground | PASS | top-50 mean height 594 m vs all-node mean -1496 m. Best 5: -88.81, 123.7E: 75.5% (h 1645 m); -85.29, 37.0E: 67.5% (h 6769 m); -85.97, -2.8E: 65.5% (h 4931 m); -89.30, 131.2E: 65.0% (h 1280 m); -87.35, -95.7E: 64.5% (h 471 m). Nodes with 0% Sun: 6075 of 90601. |
| PG-5 | Mask clamp is harmless | PASS | max Sun el 15.478°, max Earth el 17.51° over all nodes and hours (< 20.5°); highest horizon 33.794° (clamped in storage). NaN ray samples 0, nodes without DEM 0. |
| PG-6 | Shipped masks and stats decode to the recomputed values | PASS | 8 nodes incl. corners/pole: 0 mask byte mismatches, 0 stats mismatches |

Notes: the grid is a regional comparison layer (80 m DEM, 2 km nodes, 1° bins, hourly). The 14 sites keep their 20 m / 0.1° / Horizons topocentric analysis as the reference. IAU feature centres from the Gazetteer of Planetary Nomenclature (planetographic = planetocentric for the lunar reference sphere).

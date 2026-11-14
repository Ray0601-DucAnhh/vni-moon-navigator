# Data provenance

Machine-readable record: `public/data/manifest.json` (per-file source URL, retrieval
timestamp, SHA-256, row counts, parameters). Human-readable registry: `public/data/
sources.json` (S-IDs from the team's research workbook v1.1, verified 2026-11-11/13).

| Shipped file(s) | Produced by | From | Notes |
|---|---|---|---|
| `data/sites.json`, `data/regions.json`, `data/sources.json` | hand-curated from the research workbook | NSSDCA (S36), LROC pages (S37-S44), NASA CLPS map (S05), NASA release 24-136 (S45) | Coordinates planetocentric MOON_ME (DE421-aligned); regions carry names only - no invented coordinates |
| `data/horizon/im2.json`, `im1.json` | `scripts/terrain/build-horizon-masks.ts` | PGDA LOLA DEMs (S34): `LDEM_80S_20MPP_ADJ.TIF` (window via HTTP range reads), `LDEM_80S_80MPP_ADJ.TIF`, `LDEM_60S_240MPP_ADJ.TIF`; EFFRES layer sampled at each site | DEM cache checksums pinned in the manifest; masks embed the parameters and TV-4 export |
| `data/ephemeris/im2.json`, `im1.json` | `scripts/ephemeris/fetch-horizons.ts` | JPL Horizons API (S21/S50), DE441, QUANTITIES=4, 30-min, 2026-11-01→2027-11-01 | Raw responses verbatim in `data-raw/horizons/`; header assertions at fetch + validation |
| `data/ephemeris/moon-geocentric.json` | same | Horizons QUANTITIES=14,15 hourly (sub-Earth / sub-solar, MOON_ME) | Drives globe lighting + Earth arrow |
| `data/derived/*.json` | `scripts/derive/build-derived.ts` | the two files above + masks | Events (10-min scan, ≤30 s bisection) and daily fractions |
| `textures/moon_color_{2k,4k}.jpg` | `scripts/assets/prepare-texture.ts` | NASA SVS CGI Moon Kit 4k poles TIFF (APP-01) | Aesthetic product - shading labelled illustrative; `textures/SOURCE.md` |
| `data-raw/validation/*` | masks/ephemeris scripts (variants) + `validate-data.ts` | same sources + `LPSR_80S_20MPP_ADJ.TIF` (PSR flag probe) | TV/SV results JSON lives here |

Independent references used only for validation (not shipped): LROC-published IM-1
elevation (TV-1), Horizons single-instant re-queries (SV-2), a 10-min Horizons day (SV-3),
NASA SVS dial-a-moon 2026 (SV-4), the PGDA LPSR product (TV-7).

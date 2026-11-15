# Data provenance

Machine-readable record: `public/data/manifest.json` (per-file source URL, retrieval
timestamp, SHA-256, row counts, parameters). Human-readable registry: `public/data/
sources.json` (S-IDs from the team's research workbook v1.1, verified 2026-11-11/13).

| Shipped file(s) | Produced by | From | Notes |
|---|---|---|---|
| `data/sites.json`, `data/regions.json`, `data/sources.json` | hand-curated from the research workbook | NSSDCA (S36), LROC pages (S37-S44), NASA CLPS map (S05), NASA release 24-136 (S45) | Coordinates planetocentric MOON_ME (DE421-aligned); regions carry names only - no invented coordinates |
| `data/horizon/{im2,im1}.json` | `scripts/terrain/build-horizon-masks.ts` | PGDA LOLA DEMs (S34): `LDEM_80S_20MPP_ADJ.TIF` (window via HTTP range reads), `LDEM_80S_80MPP_ADJ.TIF`, `LDEM_60S_240MPP_ADJ.TIF`; EFFRES layer sampled at each site | DEM cache checksums pinned in the manifest; masks embed the parameters, `terrainFamily`, `resolutionNote`, the TV-4 export and the TV-5 `resolutionSensitivity` |
| `data/horizon/ch3.json` | same | PGDA LOLA DEMs (S34): `LDEM_60S_60MPP_ADJ.TIF` (window), `LDEM_60S_240MPP_ADJ.TIF`; EFFRES 60 m layer | same |
| `data/horizon/{a11,a12,a14,a15,a16,a17,bg1,slim,ce4,ce5,ce6}.json` | same (`scripts/lib/sldem.ts` reader) | SLDEM2015 (S33; PGDA product 54, `imbrium.mit.edu/DATA/SLDEM2015/`): 512 ppd `FLOAT_IMG` tiles (±25 km window) and the 128 ppd global file (±310 km window), via HTTP range reads | windows cached in `data-raw/dem-cache/sldem/` with JSON sidecars (gitignored) |
| `data/ephemeris/<site>.json` (all 14) | `scripts/ephemeris/fetch-horizons.ts` | JPL Horizons API (S21/S50), DE441, QUANTITIES=4, 30-min, 2026-11-01→2027-11-01 | Raw responses verbatim in `data-raw/horizons/`; header assertions at fetch + validation |
| `data/ephemeris/moon-geocentric.json` | same | Horizons QUANTITIES=14,15 hourly (sub-Earth / sub-solar, MOON_ME) | Drives globe lighting + Earth arrow |
| `data/derived/*.json` | `scripts/derive/build-derived.ts` | the two files above + masks | Events (10-min scan, ≤30 s bisection) and daily fractions |
| `textures/earth_bluemarble_1k.jpg` | `scripts/assets/prepare-earth-texture.ts` | NASA Earth Observatory Blue Marble Next Generation (April 2004, 5400×2700) | Illustrative texture for the Earth model; `textures/SOURCE.md` |
| `images/landers/<id>.jpg`, `<id>-icon.jpg`, `data/site-images.json` | `scripts/assets/prepare-lander-images.ts` | Wikimedia Commons (public-domain NASA photos; CC BY, CC BY-SA, GODL-India), licence verified at download | Illustrative lander photos for markers/popups; per-image author, licence, source and kind (on the Moon / before launch / model) |
| `textures/moon_color_{2k,4k}.jpg` | `scripts/assets/prepare-texture.ts` | NASA SVS CGI Moon Kit 4k poles TIFF (APP-01) | Aesthetic product - shading labelled illustrative; `textures/SOURCE.md` |
| `data-raw/validation/*` | masks/ephemeris scripts (variants) + `validate-data.ts` | same sources + `LPSR_80S_20MPP_ADJ.TIF` (PSR flag probe) | TV/SV results JSON lives here |

Independent references used only for validation (not shipped): LROC-published site
elevations for IM-1, Blue Ghost 1, Chandrayaan-3, SLIM, Chang'e 5 and Chang'e 6 (TV-1), Horizons single-instant re-queries (SV-2), a 10-min Horizons day (SV-3),
NASA SVS dial-a-moon 2026 (SV-4), the PGDA LPSR product (TV-7).

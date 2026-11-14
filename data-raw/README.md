# data-raw

Raw inputs and validation artifacts, kept for review and reproducibility.

- `horizons/` — verbatim JPL Horizons API responses (20 files: Sun+Earth per site in
  quarters, geocentric series, PSR validation series). Header assertions (frame, radius,
  AIRLESS, echoed site coordinates) ran at fetch time and again in validation (SV-1).
- `validation/` — validation-only artifacts: variant horizon masks (TV-5 no-20 m,
  TV-6 ranges 150/500 km, TV-8 ±300 m offsets), the Shackleton PSR point mask + Sun
  ephemeris (TV-7), and `validation-results.json` (full machine-readable results of
  `npm run data:validate -- --online`, 21 checks).
- `textures/` — the original NASA SVS CGI Moon Kit TIFF (13 MB) before conversion.
- `dem-cache/` — **gitignored** (~410 MB): full 80 m and 240 m LOLA DEMs plus cached 20 m
  window tiles and remote-file headers. Recreate any time with `npm run data:dem` (and the
  tiles re-fetch on demand during `npm run data:horizon`). SHA-256 checksums of the cached
  files are pinned in `public/data/manifest.json`, so a re-download is verifiable.

Retrieval URLs, timestamps, checksums and processing parameters for everything the app
ships are recorded in `public/data/manifest.json`.

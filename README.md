# VNI Moon Navigator

**Live demo:** https://vni-moon-navigator.vercel.app · **Code:** https://github.com/Ray0601-DucAnhh/vni-moon-navigator
> No install, no API key needed: open the link, click **South pole** -> IM-2 Athena -> **View more information**.


**Terrain-aware Sun & Earth visibility at lunar landing sites** — team VNI's entry for the
NASA Space Apps Challenge 2026 challenge *“Lunar Landing Site Navigator”*.

Spin a 3D Moon, pick one of **14 landed mission sites**, choose any moment between Nov 2026
and Nov 2027, and see where the Sun and Earth sit **relative to the real terrain horizon**
computed from NASA LOLA-based elevation data — sunlight and Earth-visibility windows, countdowns to sunset/
Earthset, a 360° horizon panorama, side-by-side site comparison, and an optional AI
assistant that explains the app's own computed results (and is caught by the app if it
states a number the data doesn't back).

> Student project. Not endorsed by NASA. Not mission-planning software. Earth visibility is
> geometric line of sight only — never a claim that a radio link would work.

## Quick start
Requires Node.js ≥ 20 (22 LTS recommended; see `.nvmrc`).

```
npm ci          # install exact locked dependencies
npm run dev     # dev server -> http://localhost:5173
npm test        # unit tests (science core, terrain marcher, SLDEM reader, data integrity, number guard)
npm run build   # typecheck + production build -> dist/
npm run preview # serve the production build -> http://localhost:4173
```

Local end-to-end check (needs Google Chrome installed; uses the preview above, no network
beyond localhost, no AI provider):

```
npm run build && npm run preview      # terminal 1
node qa/e2e/run-e2e.mjs               # terminal 2 -> qa/reports/e2e-results.json + qa/screenshots/pass-3/
```

URL test hooks: `?mockai=1` (assistant runs on a labelled mock provider, no key),
`?nowebgl=1` (non-WebGL fallback), `?debug=1` (exposes 3D model positions for the E2E check).

All scientific data is **precomputed and committed** under `public/data/` — the app needs
no API keys, no environment variables and no network beyond its own files. (The optional
assistant is the one exception: the user's own key for a provider they choose (Claude, or
free-tier Gemini / Groq / OpenRouter / Mistral), kept in tab memory only,
talking directly to the provider. See `docs/ai-assistant.md`.)

## What's inside
| Area | Where | Notes |
|---|---|---|
| Science core (one implementation for app, AI tools and pipeline) | `src/services/science/`, `src/lib/` | interpolation, horizon lookup, sun-disc fraction, states, events, window stats |
| 3D globe, markers, computed sub-solar lighting, Sun & Earth models, star background | `src/features/globe/` | React Three Fiber; Moon texture = NASA CGI Moon Kit (illustrative shading, labelled); Sun/Earth **directions computed**, sizes/distances not to scale; stars decorative |
| Site popup / detail panel / horizon panorama / compare / time bar | `src/features/` | the panorama is the DEM-derived skyline with Sun & Earth plotted on it |
| AI assistant (BYOK, tool-calling, number guard) | `src/features/assistant/`, `src/services/ai/` | every number cross-checked against tool outputs |
| Offline data pipeline | `scripts/` | DEM download & horizon marching, JPL Horizons fetch, event derivation, validation battery, texture prep |
| Committed runtime data + provenance manifest | `public/data/` | sites, ephemerides, horizon masks, derived events, `manifest.json` (URLs, SHA-256, parameters) |
| Raw Horizons responses | `data-raw/horizons/` | kept verbatim for review |
| Validation reports & results | `docs/validation/`, `data-raw/validation/` | TV-1..TV-11, SV-1..SV-5 over all 14 sites — 128 checks, 106 PASS, 22 INFO, 0 FAIL |
| Docs | `docs/` | architecture, methods, data provenance, AI design, deployment |
| QA evidence | `qa/` | checklists, review reports, screenshots, demo backup |

## Sites and terrain data
All **14 coordinate-verified landed sites** have terrain-aware analysis with the same fields,
calculations, time range (2026-11-01 → 2027-11-01 UTC) and 30-minute sampling:

| Sites | Terrain DEM | Near-field resolution |
|---|---|---|
| IM-2 Athena, IM-1 Odysseus | LOLA south-polar 20 m + 80 m + 240 m (PGDA, S34) | 20 m grid; EFFRES 17 m / 49 m |
| Chandrayaan-3 | LOLA south-polar 60 m + 240 m (S34) | 60 m grid; EFFRES 31 m |
| Apollo 11, 12, 14, 15, 16, 17, Blue Ghost 1, SLIM, Chang'e 4, 5, 6 | SLDEM2015 512 + 128 pixels/degree (S33) | ≈59 m N-S |

Each site panel shows its terrain source, resolution and a resolution-sensitivity check.
Officially named target regions **without published coordinates** stay listed as regions in
the Sites drawer rather than invented onto the globe. Validation per site:
`docs/validation/terrain-validation.md` and `docs/validation/ephemeris-validation.md`.

## Data sources & credits
LOLA south-polar DEMs (NASA GSFC PGDA; Barker et al. 2023, PSJ 4:183, DOI
10.60903/gsfcpgda-lola-spole) · SLDEM2015 (LOLA + SELENE TC; Barker et al. 2016, Icarus
273:346; NASA PGDA) · JPL Horizons (DE441) · site coordinates from NASA NSSDCA and the LROC
team (ASU) · Moon texture from the NASA SVS CGI Moon Kit · Earth texture from NASA Blue
Marble Next Generation. Details and the full
source registry: `CREDITS.md`, in-app “About the data”, and `public/data/sources.json`.

## Deploying
GitHub + Vercel steps (no env vars, free tier) and the offline demo fallback:
`docs/deployment.md`.

## Honest status (as of 2026-11-15)
- Science pipeline, validation battery (128 checks, 0 FAIL), 77 unit tests, production
  build: **run and passing** (see `docs/validation/` and `qa/reports/`).
- Local end-to-end run on the production build: **50 PASS, 0 FAIL**
  (`qa/reports/e2e-expansion.md`, screenshots in `qa/screenshots/pass-3/`).
- AI assistant: the UI → tool loop → number guard → "Data used" flow is verified locally with
  the labelled mock provider, and the multi-provider client is unit-tested with a fake API.
  The **real-provider test is PENDING** for every provider: it needs a
  key entered directly in the deployed app — protocol in `docs/ai-assistant.md`.
- Deployed on Vercel (https://vni-moon-navigator.vercel.app), auto-deployed from `main`.
- Known cosmetic items and remaining checks: `qa/reports/visual-pass-1.md`,
  `qa/checklists/delivery.md`.

Licence: MIT (`LICENSE`) for the code. NASA data/imagery remain subject to NASA's usage
guidelines; third-party sites keep their own terms.

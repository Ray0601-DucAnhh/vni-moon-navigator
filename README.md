# VNI Moon Navigator

**Terrain-aware Sun & Earth visibility at lunar landing sites** — team VNI's entry for the
NASA Space Apps Challenge 2026 challenge *“Lunar Landing Site Navigator”*.

Spin a 3D Moon, pick a landed mission site, choose any moment between Nov 2026 and Nov 2027,
and see where the Sun and Earth sit **relative to the real terrain horizon** computed from
NASA LOLA elevation data — sunlight and Earth-visibility windows, countdowns to sunset/
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
npm test        # unit tests (science core, terrain marcher, number guard)
npm run build   # typecheck + production build -> dist/
npm run preview # serve the production build locally
```

All scientific data is **precomputed and committed** under `public/data/` — the app needs
no API keys, no environment variables and no network beyond its own files. (The optional
assistant is the one exception: the user's own Anthropic key, kept in tab memory only,
talking directly to the provider. See `docs/ai-assistant.md`.)

## What's inside
| Area | Where | Notes |
|---|---|---|
| Science core (one implementation for app, AI tools and pipeline) | `src/services/science/`, `src/lib/` | interpolation, horizon lookup, sun-disc fraction, states, events, window stats |
| 3D globe, markers, computed sub-solar lighting | `src/features/globe/` | React Three Fiber; texture = NASA CGI Moon Kit (illustrative shading, labelled) |
| Site popup / detail panel / horizon panorama / compare / time bar | `src/features/` | the panorama is the DEM-derived skyline with Sun & Earth plotted on it |
| AI assistant (BYOK, tool-calling, number guard) | `src/features/assistant/`, `src/services/ai/` | every number cross-checked against tool outputs |
| Offline data pipeline | `scripts/` | DEM download & horizon marching, JPL Horizons fetch, event derivation, validation battery, texture prep |
| Committed runtime data + provenance manifest | `public/data/` | sites, ephemerides, horizon masks, derived events, `manifest.json` (URLs, SHA-256, parameters) |
| Raw Horizons responses | `data-raw/horizons/` | kept verbatim for review |
| Validation reports & results | `docs/validation/`, `data-raw/validation/` | TV-1..TV-10, SV-1..SV-4 — all PASS (two INFO/PARTIAL items documented) |
| Docs | `docs/` | architecture, methods, data provenance, AI design, deployment |
| QA evidence | `qa/` | checklists, review reports, screenshots, demo backup |

## Analysed vs context sites
Terrain-aware analysis covers **IM-2 Athena** and **IM-1 Odysseus** (both CLPS landers near
the lunar south pole, inside the verified LOLA south-polar DEMs). Twelve further landed
sites (Apollo 11–17, Blue Ghost 1, SLIM, Chandrayaan-3, Chang'e 4/5/6) appear as labelled
*context* markers without analysis, and officially named target regions **without published
coordinates** are listed honestly in the Sites drawer rather than invented onto the globe.

## Data sources & credits
LOLA south-polar DEMs (NASA GSFC PGDA; Barker et al. 2023, PSJ 4:183, DOI
10.60903/gsfcpgda-lola-spole) · JPL Horizons (DE441) · site coordinates from NASA NSSDCA
and the LROC team (ASU) · Moon texture from the NASA SVS CGI Moon Kit. Details and the full
source registry: `CREDITS.md`, in-app “About the data”, and `public/data/sources.json`.

## Deploying
GitHub + Vercel steps (no env vars, free tier) and the offline demo fallback:
`docs/deployment.md`.

## Honest status (as of 2026-11-14)
- Science pipeline, validation battery, unit tests, production build: **run and passing**
  (see `docs/validation/` and `qa/reports/`).
- Visual review: pass 1 done with screenshots; pass 2 is to be repeated on the deployed URL.
- AI assistant: implemented and wire-verified (browser→provider 401 smoke test, storage
  checks, unit-tested guard); the 10-question **live evaluation still requires a team
  member's API key** — protocol in `docs/ai-assistant.md`.
- Known cosmetic items and remaining checks: `qa/reports/visual-pass-1.md`,
  `qa/checklists/delivery.md`.

Licence: MIT (`LICENSE`) for the code. NASA data/imagery remain subject to NASA's usage
guidelines; third-party sites keep their own terms.

# Architecture

A fully static single-page app. All science is precomputed offline and shipped as JSON;
the deployed app makes **no network requests** beyond its own static files - except the
optional, user-initiated AI call from the browser to api.anthropic.com.

```text
OFFLINE PIPELINE (run by the team; results committed)
  scripts/terrain/download-dem.ts        LOLA 80m+240m DEMs -> data-raw/dem-cache (gitignored, checksummed)
  scripts/terrain/build-horizon-masks.ts DEM mosaic -> public/data/horizon/<site>.json   (terrain skylines)
  scripts/ephemeris/fetch-horizons.ts    JPL Horizons -> public/data/ephemeris/*.json    (Sun/Earth az-el; sub-solar/sub-Earth)
  scripts/derive/build-derived.ts        events + daily stats -> public/data/derived/*.json
  scripts/validate/validate-data.ts      TV/SV battery -> data-raw/validation/validation-results.json
  scripts/assets/prepare-texture.ts      NASA CGI Moon Kit -> public/textures/*.jpg
  public/data/manifest.json              provenance: URLs, timestamps, SHA-256, parameters

BROWSER (React 19 + TypeScript + Vite; three.js via React Three Fiber)
  src/services/science/core.ts   THE science core (interp, horizon lookup, sun disc, states,
                                 events, windows) - shared by UI, AI tools and pipeline
  src/services/data/*            static-JSON loaders + cache; useSiteData hook
  src/store/appStore.ts          zustand UI state (time, selection, panels)
  src/features/globe/*           Canvas: textured Moon, computed sub-solar light, markers,
                                 direction indicators, camera focus
  src/features/sites|horizon|time|compare/*  popup, detail panel, SVG panorama, time bar, compare
  src/features/assistant/* + src/services/ai/*  BYOK chat, manual tool loop, number guard
  src/content/text.ts            all scientific copy (reviewed in one place)

DATA FLOW
  select site -> lazy-load its 3 JSONs -> getSiteState(acc, mask, t) -> popup/panel/panorama
  change time -> same pure functions re-run (no network)
  compare     -> same functions for both sites at the shared time
  AI          -> tool_use -> local tool (same functions) -> tool_result -> answer -> number guard
```

Key decisions
- **One science implementation** for app, pipeline and AI tools - agreement is structural,
  then spot-verified (TV-10).
- **Precompute, don't call live**: Horizons is the official resource but best-effort; the
  demo path needs no uptime from anyone (plan v1.1 §4.1 option A).
- **Custom minimal COG reader** (BigTIFF/DEFLATE/float-predictor) instead of a heavy GIS
  dependency - ~200 lines, validated against published values (TV-1..TV-4).
- **No backend**: nothing to secure, nothing to pay for, nothing to go down; the AI key
  question is solved by not having our key anywhere.

Fallbacks: per-site data error -> retry state (rest of app works); WebGL unavailable ->
list+panels mode with a static map image; provider/AI errors -> assistant-local error
states; time outside the data window -> clamped with an explanatory message.

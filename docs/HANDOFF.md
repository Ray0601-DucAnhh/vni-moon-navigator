# HANDOFF - VNI Moon Navigator (read this first)

Written 2026-11-15 ~01:45 ICT for the next AI agent / teammate. Everything below was true at
commit `ed182b7` on `main` (pushed; local == origin/main).

## 1. What this is
- Team **VNI**'s entry for **NASA Space Apps Challenge 2026**, challenge **"Lunar Landing Site
  Navigator"**. **Submission deadline: 2026-11-15 10:00 ICT (UTC+7).**
- A static web app: spin a 3D Moon, pick one of **14 landed mission sites**, choose any time
  2026-11-01 → 2027-11-01 UTC, and see where the **Sun and Earth** are **relative to the real
  terrain horizon** (from NASA elevation data): sunlit / Earth-in-sight states, countdowns,
  360° horizon panorama, two-site compare, and an optional AI assistant that only explains
  the app's own computed numbers (a "number guard" flags any number not backed by data).
- Student project, not NASA-endorsed, not mission planning. Earth visibility = geometric line
  of sight to Earth's centre only, **never** a claim a radio link works.

## 2. Where things are
| Thing | Location |
|---|---|
| App repo (own git repo) | `D:\NASA SPACE APP CHALLENGES\VNI_MoonNavigator` |
| GitHub | `https://github.com/Ray0601-DucAnhh/vni-moon-navigator` (branch `main`) |
| Hosting | Vercel, imported from that repo, **auto-deploys on every push to main**. Live URL: https://vni-moon-navigator.vercel.app |
| Research workbook (source of truth for sites/sources; **never modify**) | `D:\NASA SPACE APP CHALLENGES\VNI_Lunar_Landing_Site_Navigator_Research_Workbook_v1.1.xlsx` (original input `D:\NASA SPACE APP CHALLENGES\Opensoucre - NASA.xlsx`, also never modify) |
| Portable Node 22 (machine has no global Node) | `D:\NASA SPACE APP CHALLENGES\.tools\node` - in Git Bash: `export PATH="/d/NASA SPACE APP CHALLENGES/.tools/node:$PATH"` |

## 3. Run / test / deploy
```
npm ci
npm run dev                         # http://localhost:5173
npm test                            # vitest: 73 tests
npm run build                       # tsc --noEmit + vite build -> dist/
npm run preview                     # http://localhost:4173
node qa/e2e/run-e2e.mjs             # needs preview running + Google Chrome; 50 checks
npx tsx scripts/validate/validate-data.ts [--online]   # data battery (128 checks with --online)
```
Deploy = commit + `git push` (user pushes; Vercel builds in ~1 min). Vercel settings: preset
Vite, build `npm run build`, output `dist`, no env vars. `vercel.json` sets CSP + headers.
URL test hooks: `?mockai=1` (mock AI provider, labelled TEST MODE), `?nowebgl=1` (fallback UI),
`?debug=1` (writes 3D model positions to `<html data-vni-earth/-sun/-light>` for E2E).

## 4. Architecture (fully static, no backend)
- React 19 + TypeScript + Vite; three.js via React Three Fiber + drei; zustand store.
- **All science is precomputed offline** by `scripts/` and committed as JSON in `public/data/`.
  The browser only interpolates and looks things up. No network except its own files and the
  optional user-initiated AI call.
- **One science core** shared by UI, AI tools and pipeline: `src/services/science/core.ts`,
  `src/lib/coords.ts` (agreement verified by TV-10).
- Startup loads `sites.json`, `sources.json`, `regions.json`, `ephemeris/moon-geocentric.json`;
  each site's 3 files load **on demand** (`useSiteData.ensure(id)`) when selected/compared/asked.
- Key folders: `src/features/{globe,sites,horizon,time,compare,assistant}`, `src/services/{data,science,ai}`,
  `src/content/text.ts` (all scientific copy/limitations), `scripts/{terrain,ephemeris,derive,validate,assets,lib}`.

## 5. Data - formats and meaning (public/data/)
Conventions: planetocentric lat/lon, Moon mean-Earth/polar-axis frame (MOON_ME, DE421), lon
east-positive −180..180; heights m relative to 1,737.4 km sphere; UTC; azimuth clockwise from
north; elevation from local horizontal; airless (no refraction).

| File | Content |
|---|---|
| `sites.json` | `{frame, analysedNote, sites[]}`; each site: `id, name, shortName, category ("Landed - CLPS" / "Landed - historic crewed" / "Landed - other national program"), mission, agency, latDeg, lonDeg, publishedElevM, landingDateUtc, statusNote, analysed:true, sourceIds[], notes[]` |
| `regions.json` | officially named regions **without published coordinates** - listed, never placed on the globe (workbook decision D-04: never invent coordinates) |
| `sources.json` | source registry S01-S50 (+APP-01) with title/org/URL, from the workbook |
| `ephemeris/<id>.json` | JPL Horizons topocentric apparent az/el: `{siteId, startUtc:"2026-11-01T00:00:00Z", stepS:1800, count:17521, sunAz[], sunEl[], earthAz[], earthEl[]}` (deg, 4 dp) |
| `ephemeris/moon-geocentric.json` | `{startUtc, stepS:3600, count:8761, subEarthLonE[], subEarthLat[], subSolarLonE[], subSolarLat[]}` - lights the globe and points the 3D Sun/Earth models |
| `horizon/<id>.json` | terrain mask: `horizonElDeg[3600]` (0.1° azimuth bins), `horizonDistKm[3600]`, `azStepDeg, observerHeightM:2, demHeightM, smoothRefDeg, demFiles[], effectiveResM, maxRangeKm:300, nanSamples, generated, tv4 (exported points), terrainFamily, resolutionNote, resolutionSensitivity{rmsDeg,maxDeg,comparedWith}` |
| `derived/<id>.json` | `{siteId, windowStartUtc, windowEndUtc, sunEvents[{type:"rise"/"set",utc}], earthEvents[], dailyDates[], dailySunlitFrac[], dailyEarthFrac[]}` |
| `manifest.json` | provenance: source URLs, retrieval times, SHA-256, parameters (written under a lock file) |
| `public/textures/` | Moon (NASA SVS CGI Moon Kit, illustrative) + `earth_bluemarble_1k.jpg` (NASA Blue Marble NG); `SOURCE.md` |

Raw/validation (not shipped): `data-raw/horizons/` (116 verbatim Horizons responses),
`data-raw/validation/` (variants + `validation-results.json`), `data-raw/dem-cache/` (gitignored, re-downloadable).

### Methods (details: docs/methods.md)
- Ephemeris: Horizons QUANTITIES=4, observer at site (DEM height + 2 m), 30-min steps;
  display = linear interpolation (azimuth on shorter arc; error ≤0.0001°, SV-3).
- Horizon: for 3,600 azimuths march the great circle (10 m steps to 20 km, 40 m to 300 km),
  `el = asin(((P−O)·û_O)/|P−O|)`, keep max. Height sampler is chosen by `terrainFamily`:
  - **polar80** (IM-2, IM-1): LOLA south-polar 20 m within ±24 km → 80 m → 240 m (PGDA product 90, S34).
  - **polar60** (Chandrayaan-3): LOLA 60 m within ±24 km → 240 m.
  - **sldem** (Apollo 11/12/14/15/16/17, Blue Ghost 1, SLIM, Chang'e 4/5/6): SLDEM2015 (LOLA+SELENE,
    PGDA product 54, S33) 512 ppd within ±25 km, 128 ppd to 310 km, read by HTTP range (`scripts/lib/sldem.ts`).
- Sunlit (terrain-aware) = solar-disc centre above horizon (visible fraction ≥0.5, disc radius 0.26645°).
  Earth visible = Earth centre above horizon. "Smooth Moon" columns use a 0° horizon for comparison.
- Events: clearance zero-crossings scanned every 10 min, bisected to ≤30 s.

### Validation status (docs/validation/*.md) - 128 checks, 106 PASS, 22 INFO, 0 FAIL
TV-1 DEM height vs LROC-published elevation at 6 sites (−2.7…+25.9 m); TV-4 independent
recomputation (≤0.007°); TV-5 resolution sensitivity (7 INFO at flat mare sites - shown in the
panel as "Resolution check", not a failure); TV-6 range; TV-7 PSR cross-check; TV-10 app vs
derived; TV-11 terrain sunlight ≤ smooth; SV-1..SV-5 Horizons checks (far-side CE4/CE6 never see Earth).
Year means: sunlit 38-51%, Earth visible 100% at most near-side sites, 80.1% IM-2, 0% CE4/CE6.

## 6. 3D visuals
- Moon texture is illustrative (labelled). Lighting direction = computed sub-solar point.
- Sun and Earth models (`src/features/globe/SunEarthModels.tsx`): **directions computed** from the
  geocentric series (E2E: 0.0000° error); **sizes/distances not to scale** (on-screen captions).
  Fade when in front of the Moon; caption hidden when the Moon blocks it.
- "Sun & Earth" top-bar button frames all three; distance adapts to screen aspect (phones farther).
- Site markers show a round lander photo in a category-coloured ring (fallback: original shape); the popup and detail panel show the photo with kind, author and licence. Data: `public/data/site-images.json`, images in `public/images/landers/`, made by `scripts/assets/prepare-lander-images.ts` (open licences only).
- Star background (`SpaceBackground.tsx`) is a seeded decorative field, explicitly not a star map.

## 7. AI assistant (src/services/ai/, src/features/assistant/)
- **BYOK only.** User types their own key in the panel; key + provider + model live in tab memory
  (`keyStore.ts`) only - never stored, logged, or sent anywhere but the chosen provider.
- Providers (`providers.ts`; CSP in `vercel.json` allows exactly these hosts; all verified CORS-OK):
  Anthropic Claude (paid, model fixed `claude-opus-5-5`, official SDK, `client.ts`); Google Gemini
  (free tier, default `gemini-3.8-flash`); Groq (free tier, `openai/gpt-oss-120b`); OpenRouter
  (free `:free` models, `nvidia/nemotron-3-ultra-550b-a55b:free`); Mistral (free tier, `mistral-small-latest`).
  Non-Claude providers use `openaiCompat.ts` (POST `/chat/completions`, Bearer key). Model field editable.
- Same 6 read-only tools for all (`tools.ts`: list_sites, get_site_summary, compare_sites,
  get_windows, get_method_notes, get_sources), manual tool loop ≤6 rounds, system prompt
  (`systemPrompt.ts`) forbids invented numbers / safety rankings.
- Number guard (`numberGuard.ts`): every number in an answer must match tool output; digits glued
  to letters (SLDEM2015, S39) are ignored; unmatched numbers are highlighted.
- Fixes already made from live user tests: Gemini 2.5-flash retired → 3.8-flash; Groq rejected
  `null` optional args → optional props accept null (not for Gemini), nulls dropped before tools.

## 7b. Operation windows (added 2026-11-15)
`src/services/science/planning.ts` (`findOperationWindows`), panel section "Find operation windows" (`src/features/planner/WindowFinder.tsx`), assistant tool `find_operation_windows`; tests in `tests/planning.test.ts`. IM-2, Sun+Earth, >= 48 h: 12 windows, 3,054 h, first 2026-11-15 06:12 -> 11-30 20:38 (374.4 h), shortest 91.6 h (May 2027).
Also done 2026-11-15: V4 event-time +/- (SV-7), V11 Earth disc fraction, V6 custom point (Level A, SV-6). V5 trade-offs (Compare panel, Pareto + weights + rank stability) done too. Not done: V5 landing-date chart, V10 CI / chunk split (manualChunks object form rejected by this Vite version).

## 8. WHERE WE STOPPED / what's next (priority order)
1. **Confirm the Groq fix live** (commit `ed182b7`, already pushed): user reloads the Vercel site,
   re-enters the Groq key, asks "Explain the selected site right now". Then also try Gemini.
   If a provider errors, read the exact message; adjust `openaiCompat.ts` / `providers.ts`; add a
   unit test in `tests/openaiCompat.test.ts`; `npm test && npm run build`; commit; user pushes.
2. **Real-provider AI evaluation is PENDING** (`qa/reports/ai-eval.md`, 10 questions, protocol in
   `docs/ai-assistant.md`). Only mock + fake-API tests have passed. **Never claim the real AI
   integration passed until a user-entered key run actually succeeds**; record results there.
3. **Visual check on the deployed URL** (desktop + phone): globe, 14 sites, popup/panel, compare,
   Sun & Earth view, AI panel; DevTools console/network (CSP only applies on Vercel, not preview).
4. **Submission form** (Space Apps site): project link = Vercel URL; NASA data links were already
   given to the user (PGDA products 90 and 54, JPL Horizons, NSSDCA Apollo coordinates, CLPS map,
   Artemis III regions release, SVS CGI Moon Kit, Blue Marble, LROC images 1360/1408/1407/1314/1358/1087/1172/1374).
   Optional: demo video/screenshots (`qa/screenshots/pass-3/`, `qa/demo-backup/`).
5. After the deadline (optional ideas): Claude model choice (Sonnet/Haiku cheaper), OpenAI provider.

## 9. Rules the user set (keep them)
- Do **not** ask the user to paste API keys into chat or put keys in any file; no keys in repo.
- Do **not** push/deploy without the user's go-ahead (so far the user runs `git push` themselves).
  Commit only when asked; commit messages end with `Co-Authored-By: <model> <noreply@anthropic.com>`.
- Do **not** modify the research workbook. Do not invent data or coordinates; keep region-only
  entries labelled. Keep the existing data format, methods, visual language (expand, don't redesign).
- Report honestly: pending is pending; include real errors; don't overclaim.
- The user writes Vietnamese; reply in Vietnamese, concise, step-by-step for UI tasks.

## 10. Known limitations (also in-app "About the data")
DEM resolution (TV-5 sensitivity at flat mare sites); unmodelled rocks/landers; single 2 m
observer height; IM-1 ±300 m coordinate precision (horizon up to 4.3° different, TV-8);
Earth treated as a point; events < 10 min may be missed; texture/models illustrative; free AI
models follow rules less reliably (guard still flags); E2E ran on headless software WebGL and
emulated mobile, not a physical phone.

## 11. Key docs
`README.md` · `docs/methods.md` · `docs/data-provenance.md` · `docs/architecture.md` ·
`docs/ai-assistant.md` · `docs/deployment.md` · `docs/validation/{terrain,ephemeris}-validation.md` ·
`qa/reports/e2e-expansion.md` · `qa/reports/ai-eval.md` · `qa/reports/ai-security.md` · `CREDITS.md`

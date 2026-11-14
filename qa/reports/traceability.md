# Requirements traceability (plan v1.1 §11.4 -> this build)

Status date: 2026-11-14 (pre-deployment). "Verified by" names the recorded evidence.

| Confirmed requirement | Where implemented | Verified by | Status |
|---|---|---|---|
| Real DEM-derived terrain in the local-horizon analysis (no smooth-sphere substitute) | `scripts/terrain/*` -> `public/data/horizon/*`; used in every state via `core.ts` | TV-1..TV-10 (`docs/validation/terrain-validation.md`); TA-4/TA-5 visuals (shots 03, 06) | **DONE** (TV-9 screenshot pair pending) |
| Functional AI assistant explaining/comparing with app-computed results; no mock; no invented values | `src/services/ai/*`, `src/features/assistant/*` | Wiring: 401 smoke + storage checks (`ai-security.md`); guard + tools unit tests; **live 10-question eval pending a team key** (`ai-eval.md`) | **IMPLEMENTED, live eval pending** |
| BYOK only; key in browser memory; no team key; no secrets in repo | `keyStore.ts`; no server; repo scan | `ai-security.md` | **DONE** (re-check on deploy) |
| Self-contained repo at `VNI_MoonNavigator`, conventional layout, package.json+lockfile, README, .gitignore, data included, no outside-file dependencies | repo root | Fresh-clone build on delivery checklist; path grep | **DONE** (fresh-clone check on delivery day) |
| Ready for GitHub upload + Vercel deploy by the team, with instructions & settings; no secrets/env needed | `docs/deployment.md`, `vercel.json`, `.nvmrc` | Team executes; delivery checklist | **READY** (not uploaded/deployed by this session, per instructions) |
| Workbook not modified | - | Timestamp check 2026-11-14: unchanged (v1.1 file dated 2026-11-13) | **DONE** |
| Two sites IM-2/IM-1; curated source-traceable catalogue; regions without coordinates never placed | `public/data/sites.json`, `regions.json`, drawer | PR-01 spot checks; shots 02-07 | **DONE** |
| Now + date/time + scrubber within the 12-month window; out-of-range handled | `TimeBar.tsx`, store clamp | F-03 | **DONE** |
| Sun/Earth vs horizon display incl. panorama; illumination view; compare 2 sites | globe, panorama, compare | SV/TV battery + shots | **DONE** |
| Visible data/method/limitations; DTE geometric-only wording everywhere | `content/text.ts`, About, panels | SV-8 copy audit (code search: no "safe/optimal/approved/guarantee(d)/best site" claims outside negations) | **DONE** |
| Desktop-first + usable mobile; ≤5 s load; designed states; AA contrast; keyboard | styles + app | Pass 1 (+fixes); P-01 measured; **pass 2, contrast measurement, full keyboard run pending on deployed URL** | **PARTIAL** |
| 24 team-hours cap; honest completion reporting | - | This report + README "Honest status" | **DONE** |

# Visual review - pass 1 (2026-11-14, dev + first production build)

Rendered and inspected in the Claude desktop built-in browser (Chromium). Screenshots in
`qa/screenshots/pass-1/`. Checklist: `qa/checklists/visual.md`. Severity: S1 blocks demo,
S2 visible defect, S3 polish.

| # | Screen / state | Viewport | Finding | Severity | Action | Re-check |
|---|---|---|---|---|---|---|
| 1 | First load, "Now" (near new moon) | 800x600 | Moon almost fully dark at the demo date - physically correct but hard to read | S2 | Ambient light raised 0.055 -> 0.09; night side now legible (shots 09, 10) | FIXED |
| 2 | IM-2 popup | 800x600 | All values render with units; badge wraps to two lines in two rows | S3 | Accepted (no clipping; wrapping is clean) | OPEN (cosmetic) |
| 3 | Detail panel open | 800x600 | Popup stayed open under the panel, duplicating content | S2 | Popup now hidden while the detail panel is open (App.tsx) | FIXED (shot 06 state) |
| 4 | Markers while zoomed close | 800x699 | Fixed world-size markers became huge near the surface | S2 | Per-frame distance-scaled markers (clamped 0.18-1.1) | FIXED (shots 05, 09) |
| 5 | Earth direction sprite | 1440x900 | Sprite can sit at the viewport edge with its label off-screen, reading as a stray dot | S3 | Accepted for this build; sprite is labelled whenever visible with its line | OPEN (cosmetic) |
| 6 | Assistant 401 flow | 800x699 | After an invalid key, panel returned to the key screen with no explanation | S2 | Auth error + "key removed" notice now shown on the key screen | FIXED in code; re-check in pass 2 |
| 7 | Mobile top bar | 375x812 | Top-bar buttons overflowed the right edge ("Con..." clipped) | S2 | Top bar horizontally scrollable on mobile; hint hidden; brand shrunk | FIXED in code; re-check in pass 2 |
| 8 | Mobile popup | 375x812 | Popup fits width, readable, no clipped text (shot 12) | - | Pass | PASS |
| 9 | Compare panel | 800x699 | Two columns fit 400 px, no horizontal scroll (shot 07) | - | Pass | PASS |
| 10 | Loading state | 375x812 | Designed silhouette + text shown (shot 11) | - | Pass | PASS |

## Checklist outcomes (this pass)
- V-1 layout grid: PASS (8 px rhythm; panels per spec).
- V-2 legibility: PASS (body 14 px desktop; mono numerals).
- V-3 clipping script (`scrollWidth > clientWidth` under hidden overflow): run on the dev build
  home + popup + detail states - empty list. Mobile top bar was caught visually (#7) because it
  uses scrollable overflow (allowed) but had no scroll affordance; fixed as above.
- V-4 overlap: PASS after #3 (popup vs panel).
- V-5 globe visibility: PASS by construction at 1440x900 ((1440-400-12)/1440 = 71% width for the
  globe with a panel open); verified visually in shot 10 at full width.
- V-8 marker size/clarity: PASS after #4; selection ring visible on lit and dark surface.
- V-9 states: loading PASS; per-site unavailable + WebGL-off not exercised in this pass
  (functional review F-05 covers them in pass 2).
- V-10 labels: PASS - "not to scale", "Sun direction", smooth-reference and terrain-source
  labels all present (shots 03, 06, 09).

## Performance note (P-01)
Production build, localhost: DOMContentLoaded 150 ms; all data JSON done by ~284 ms;
payload ~1.1 MB JS + 243 kB 2k texture (4k, 937 kB, upgrades in the background), ~0.6 MB
site data. Well under the 5 s target on localhost; on a normal connection the dominant cost
is ~1.4 MB transfer. To be re-measured on the deployed URL (pass 2).

## Not covered in pass 1
Keyboard-only walkthrough (A-02), contrast measurements (A-01), WebGL-off and blocked-JSON
states (F-05), real-phone photo - scheduled for pass 2 on the deployed URL.

## Pass 1b - follow-up fixes (2026-11-14 evening, dev build)
| # | Item | Action | Result |
|---|---|---|---|
| 2 | Popup label wrapping (S3) | Labels shortened ("Sun", "Horizon at Sun az", "Earth"; "disc N%") | FIXED - verified in the IM-1/IM-2 popups (backup shots 02, and session shots) |
| 5 | Earth sprite label off-screen (S3) | Sprite shrunk 0.045->0.034; labels moved inside the sprite radius (1.38R); label text "Earth (not to scale)" | FIXED in code - confirm on the deployed URL in pass 2 |
| 11 | NEW (found in F-05 run): selecting a site from the drawer left the drawer covering the popup (S2, V-4) | Drawer now closes on selection | FIXED - verified by click and by keyboard |
| 12 | NEW: raw JSON-parse text in the data-unavailable card (S3) | Loader detects the SPA fallback and reports "data file missing: <url>" | FIXED - verified live |
| 13 | NEW: no "Reset view" control (plan 2.1 listed one) | Not added - zoom/rotate and "South pole" cover the demo flows | OPEN (S3, deliberate) |
| - | Contrast (A-01/V-6) | `scripts/validate/contrast-check.ts`: 15 token pairs measured; `--text-faint` lightened #6b7385 -> #808a9e (3.96:1 -> 5.42:1); panorama/label hardcoded greys updated too | **ALL 15 PASS** (4.5:1 normal / 3:1 large-UI thresholds) |
| - | Texture/marker alignment (SV-9 visual) | Full-disc view 2026-11-24: Tycho's ray system, maria and all Apollo rings sit on the correct albedo features | PASS (backup shot 01) |

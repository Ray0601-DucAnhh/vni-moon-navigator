# Submission notes (fill the official form from this)

**Project name:** VNI Moon Navigator
**Team:** VNI · **Challenge:** Lunar Landing Site Navigator (2026)
**Live demo:** https://________.vercel.app (fill after deploy) · **Code:** https://github.com/________

## 30-second pitch
Tools like Quickmap, Moon Trek and Horizons hold the data, but comparing landing
site-and-date scenarios is slow for non-specialists. VNI Moon Navigator turns NASA LOLA
terrain and JPL Horizons ephemerides into one intuitive 3D view: pick IM-2 or IM-1, pick a
moment, and instantly see the Sun and Earth against the site's **real terrain skyline** -
sunlight windows, time to sunset/Earthset, Earth-visibility, side-by-side comparison, and
an AI explainer whose every number is cross-checked by the app itself.

## What's real (say this proudly)
- Terrain horizons marched from 20/80/240 m LOLA DEMs (validated: +13 m vs LROC's IM-1
  elevation; a mapped Shackleton PSR point stays dark all 8,761 hours; independent-formula
  recomputation to 0.0002°).
- Ephemerides from JPL Horizons (official challenge resource), spot-re-queried to 0.00005°.
- The headline insight at IM-2: Earth can be geometrically visible even at -0.1° elevation
  because the real horizon dips to -1.5° - and terrain-aware sunlight (52% next 30 days)
  differs sharply from the smooth-Moon value (59%). Terrain is the story.

## What to be honest about (judges respect it)
- Two analysed sites; 12 more as labelled context; named regions without published
  coordinates are listed, not invented.
- Geometric Earth visibility ≠ a working radio link (said everywhere).
- Known limitations are one click away (About the data), incl. IM-1's ±300 m coordinate
  uncertainty moving parts of its horizon by ~4°.
- Assistant is bring-your-own-key; the app flags any AI number its data can't back.

## Official resources used
JPL Horizons (ephemerides) · LOLA topography (via the PGDA south-pole DEMs) · Quickmap /
Moon Trek (visual cross-checks) - plus NSSDCA & LROC coordinates, NASA SVS Moon Kit texture.

## Demo script (3 min)
1. (20 s) Open on the live Moon - "lighting is computed for *now* from JPL Horizons".
2. (40 s) South pole → IM-2 popup: Sun below terrain, Earth in sight at -0.1°, countdowns.
3. (50 s) View more → panorama: "this skyline is marched from NASA's 20 m LOLA data";
   scrub time - watch the Sun ride the real ridge line; terrain vs smooth columns.
4. (30 s) Compare IM-2 vs IM-1: 52% vs 42% sunlit, 13 d vs 4 d longest darkness.
5. (30 s) Assistant (key entered beforehand): "Compare the sites over 30 days" → show the
   "Data used" drawer + "all numbers match app data" footer.
6. (10 s) About the data: sources, validation, limitations. "Everything traceable."
Backup if anything fails: `qa/demo-backup/` video + screenshots.

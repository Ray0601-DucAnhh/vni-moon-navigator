# Credits, data sources and licences

VNI Moon Navigator is a student project by **team VNI** for the NASA Space Apps Challenge
2026 (“Lunar Landing Site Navigator”). It is **not endorsed by NASA**. NASA Space Apps and
the data providers below are credited as sources, not sponsors.

## Scientific data
| What | Source | Terms / citation |
|---|---|---|
| Lunar south-polar elevation (terrain horizons for IM-1, IM-2, Chandrayaan-3; 20/60/80/240 m DEMs, EFFRES, LPSR cross-check) | NASA GSFC Planetary Geodesy Data Archive, product “A New View of the Lunar South Pole from LOLA” — https://pgda.gsfc.nasa.gov/products/90 | Cite **Barker et al. 2023, Planet. Sci. J. 4, 183** (paper DOI 10.3847/PSJ/acf3e1; data DOI 10.60903/gsfcpgda-lola-spole). US-government work; NASA reproduction guidelines apply. |
| Lunar elevation between 60°S and 60°N (terrain horizons for Apollo 11-17, Blue Ghost 1, SLIM, Chang'e 4/5/6) | SLDEM2015 (LOLA + SELENE Terrain Camera), NASA GSFC PGDA product 54 — https://pgda.gsfc.nasa.gov/products/54 ; data files at http://imbrium.mit.edu/DATA/SLDEM2015/ (512 ppd tiles, 128 ppd global) | Cite **Barker et al. 2016, Icarus 273, 346-355** (doi:10.1016/j.icarus.2015.07.039). PDS data set LRO-L-LOLA-4-GDR-V1.0. |
| Sun/Earth apparent positions; sub-solar & sub-Earth points (DE441) | JPL Horizons System, NASA/JPL Solar System Dynamics Group — https://ssd.jpl.nasa.gov/horizons/ | Public service; acknowledge “JPL Horizons”. Official challenge resource. |
| Apollo site coordinates | NASA NSSDCA, “Apollo Landing Site Coordinates” (DE421 ME frame; Wagner et al. 2017, Icarus 283) | US-government work. |
| Robotic-lander coordinates (IM-1, IM-2, Blue Ghost 1, SLIM, Chandrayaan-3, Chang'e 4/5/6) | LROC team featured images, Arizona State University (lroc.im-ldi.com; exact pages in `public/data/sources.json`) | Credit “NASA/GSFC/Arizona State University”. |
| CLPS mission→region names; Artemis candidate-region names | NASA CLPS interactive map; NASA release 24-136 | US-government works. Names only — no coordinates were published there, so none are shown. |

## Imagery & assets
- **Moon colour texture**: NASA SVS **CGI Moon Kit** (svs.gsfc.nasa.gov/4720), visualisation
  by Ernie Wright, built from the LROC WAC mosaic with LOLA data at the poles. NASA states it
  is “optimized for aesthetics, not science” — the app labels surface shading as
  illustrative. NASA imagery is generally free to use with attribution and without implying
  endorsement; see `public/textures/SOURCE.md`.
- **Earth model texture**: NASA Earth Observatory **Blue Marble Next Generation** with topography and bathymetry (R. Stöckli, NASA GSFC), April 2004 composite, resized to 1024×512. Used only for the illustrative Earth model (size, distance and rotation not to scale/not modelled).
- **Fonts**: Inter, Space Grotesk, JetBrains Mono via @fontsource npm packages — all under
  the SIL Open Font License 1.1.

## Software
Built with React, three.js, React Three Fiber/drei, zustand, Vite, TypeScript, Vitest,
sharp and the official `@anthropic-ai/sdk` (all under their respective OSS licences; see
`package-lock.json`). The optional assistant calls the AI provider the user selects
(Anthropic, Google Gemini, Groq, OpenRouter or Mistral) with the **user's own key**; usage is
billed or rate-limited under that provider's terms.

## Research provenance
The site catalogue, source registry (S-IDs) and method definitions originate from the
team's research workbook *VNI_Lunar_Landing_Site_Navigator_Research_Workbook_v1.1.xlsx*
(sources verified 2026-11-11/13); the machine-readable registry used by the app is
`public/data/sources.json`, and per-file provenance (URLs, retrieval times, SHA-256,
parameters) is in `public/data/manifest.json`.

## Code licence
MIT — see `LICENSE`. (The licences and terms above apply to the data and assets themselves.)

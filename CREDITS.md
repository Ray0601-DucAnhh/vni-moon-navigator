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

## Lander photos (illustrative; not used in any calculation)
From Wikimedia Commons, licence checked at download time by `scripts/assets/prepare-lander-images.ts`; resized/cropped by team VNI (CC BY-SA derivatives are shared under the same licence). Labels in the app say whether a photo shows the lander on the Moon, before launch, or a model.

| Site | Photo | Author | Licence | Source |
|---|---|---|---|---|
| IM-2 Athena | Intuitive Machines Nova-C lander, the same design as IM-2 Athena (photo shows the IM-1 lander before launch). (before launch) | NASA Marshall Space Flight Center / Intuitive Machines | Public domain | https://commons.wikimedia.org/wiki/File:Intuitive_Machines%E2%80%99_Nova-C_lunar_lander_(IM_00309)_(cropped).jpg |
| IM-1 Odysseus | IM-1 Nova-C lander Odysseus before launch. (before launch) | NASA Marshall Space Flight Center / Intuitive Machines | Public domain | https://commons.wikimedia.org/wiki/File:Intuitive_Machines%E2%80%99_Nova-C_lunar_lander_(IM_00309)_(cropped).jpg |
| Apollo 11 | Apollo 11 Lunar Module Eagle at Tranquility Base, with Buzz Aldrin (AS11-40-5927). (on the Moon) | Neil Armstrong | Public domain | https://commons.wikimedia.org/wiki/File:As11-40-5927.jpg |
| Apollo 12 | Apollo 12 Lunar Module Intrepid on the Moon. (on the Moon) | NASA | Public domain | https://commons.wikimedia.org/wiki/File:Apollo-12-LM.jpg |
| Apollo 14 | Apollo 14 Lunar Module Antares on the Moon (AS14-66-9277). (on the Moon) | NASA | Public domain | https://commons.wikimedia.org/wiki/File:Apollo_14_Lunar_Module_(LM)_on_the_moon.jpg |
| Apollo 15 | Apollo 15 Lunar Module Falcon at Hadley-Apennine, tilted on a crater rim. (on the Moon) | Apollo Image Gallery | Public domain | https://commons.wikimedia.org/wiki/File:Apollo_15_Lunar_Module_Falcon_-_51358762770.jpg |
| Apollo 16 | Apollo 16 Lunar Module Orion at Descartes (AS16-113-18334). (on the Moon) | NASA Johnson Space Center | Public domain | https://commons.wikimedia.org/wiki/File:View_of_the_Apollo_16_Lunar_Module_on_the_lunar_surface_(as16-113-18334).jpg |
| Apollo 17 | Apollo 17: Eugene Cernan tests the rover beside Lunar Module Challenger (AS17-147-22527). (on the Moon) | NASA | Public domain | https://commons.wikimedia.org/wiki/File:Apollo_17_first_test_of_the_lunar_rover_AS17-147-22527HR.jpg |
| Blue Ghost 1 | Firefly Blue Ghost lander mockup (Space Symposium 2025). (full-scale model) | Blervis | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Firefly_Blue_Ghost_lander_mockup.jpg |
| Chandrayaan-3 | Chandrayaan-3 Vikram lander on the Moon, imaged by the Pragyan rover (crop of a stereo image). (on the Moon) | ISRO/Simeon Schmauß | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Chandrayaan_3_Vikram_lander_stereo_(53167467822)_crop.png |
| SLIM | Half-scale model of JAXA's SLIM lander in landing configuration. (scale model) | Hms1103 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:SLIM_half_scale_model_(close_cropped).png |
| Chang'e 4 | Chang'e 4 lander on the lunar far side, imaged by the Yutu-2 rover. (on the Moon) | CSNA/Siyu Zhang/Kevin M. Gill | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:ChangE-4_-_PCAM.png |
| Chang'e 5 | Full-scale mockup of the Chang'e 5 lander and ascender. (full-scale model) | Shujianyang | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Chang%27e-5_mockup_at_CSTM_02.jpg |
| Chang'e 6 | Full-scale mockup of the Chang'e 5 lander; Chang'e 6 was built to the same design as its backup. (full-scale model) | Shujianyang | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Chang%27e-5_mockup_at_CSTM_03.jpg |

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

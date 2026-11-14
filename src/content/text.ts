/** All scientific copy in one reviewed place (science owner: R2).
 *  SV-8 copy audit: no "safe", "optimal", "approved", "guaranteed",
 *  "best site" claims anywhere; DTE is always "geometric line of sight". */

export const DTE_DISCLAIMER =
  "Earth above the horizon means geometric line of sight to the Earth's centre only. " +
  "It is NOT a guarantee of a working radio link: real communication also depends on " +
  "terrain near the antenna, antenna pointing, hardware, power, relays and mission design.";

export const TERRAIN_BADGE = "Terrain-aware · LOLA / SLDEM2015 DEM · JPL Horizons";

export const SMOOTH_NOTE =
  "“Smooth Moon” columns use a 0° horizon (the local horizontal plane, no terrain) " +
  "for comparison, so the effect of real terrain is visible.";

export const LIMITATIONS: string[] = [
  "Terrain horizons come from LOLA elevation data, out to 300 km, with the resolution used shown per site: near the south pole (south of 60\u00b0S) the PGDA LOLA polar DEMs (20 m or 60 m within 20 km of the site, 80 m / 240 m beyond); elsewhere SLDEM2015 (LOLA + SELENE, 512 pixels/degree \u2248 59 m within 25 km, 128 pixels/degree \u2248 237 m beyond). Effective resolution can be coarser where LOLA tracks were interpolated.",
  "At flat mare sites (e.g. Apollo 11, Apollo 12, Blue Ghost 1, Chang’e 5) the horizon is only a degree or two high and is set by small craters within ~25 km, so it is sensitive to DEM resolution: coarsening the near-field DEM ~4x lowers it by up to ~1° on average. The detail panel shows each site’s measured sensitivity; relief finer than ~59 m is not represented.",
  "Boulders, small craters below the map resolution, and the lander itself are not modelled. The evaluated point sits 2 m above the local surface (a configurable, team-chosen stand-in for a deck or mast; results are for that point, not a specific vehicle).",
  "“Sunlit” means the centre of the solar disc is above the terrain horizon (visible fraction ≥ 0.5). The horizon is treated as straight across the Sun's 0.27° half-degree disc.",
  "Earth visibility uses the Earth's centre. " + DTE_DISCLAIMER,
  "Sun and Earth directions are linearly interpolated between 30-minute JPL Horizons samples (checked error ≤ 0.01° for elevation on a sample day). Events shorter than 10 minutes can be missed.",
  "IM-1's published coordinates have 2-decimal precision (~300 m). Moving the site by 300 m changes parts of its horizon by up to ~4.3° (measured), so treat IM-1's exact windows with care. IM-2's coordinates are 4-decimal.",
  "Illustrative visuals: the Moon texture (NASA CGI Moon Kit, \u201coptimized for aesthetics, not science\u201d), the 3D Sun and Earth models (their DIRECTIONS are computed from JPL Horizons sub-solar and sub-Earth points; their sizes and distances are NOT to scale, and Earth\u2019s rotation and clouds are not modelled), and the background stars (decorative, not a star map).",
  "Times are UTC. Mission status notes are “as of” their stated date and may have changed.",
  "This is a student project for NASA Space Apps Challenge 2026. It is not NASA-endorsed, not mission-planning software, and it makes no landing-safety or site-suitability claims.",
];

export const METHOD_SUMMARY: string[] = [
  "Positions: JPL Horizons (DE441 ephemeris), apparent azimuth/elevation of the Sun and Earth for an observer at the site in the Moon's mean-Earth frame; airless (no refraction), 30-minute samples, 2026-11-01 to 2027-11-01 UTC.",
  "Terrain horizon: for each of 3600 azimuths, the maximum elevation angle of LOLA-derived terrain along the great circle out to 300 km, including lunar curvature, for an observer 2 m above the DEM surface (south-polar PGDA DEMs south of 60\u00b0S, SLDEM2015 elsewhere). Range convergence checked per site.",
  "States: sunlit = Sun-disc centre above the terrain horizon; Earth visible = Earth centre above the terrain horizon (geometric). Countdowns come from pre-computed crossings refined to the minute.",
  "Verification: site height vs LROC (+13 m at IM-1); independent chord-formula recomputation (≤ 0.0002°); spot re-queries against Horizons (≤ 0.0001°); sub-solar point vs NASA SVS (≤ 0.001° in 2026); a mapped permanently-shadowed point in Shackleton stays dark all year (max Sun clearance −18.3°). Full log in the repository (docs/validation/).",
];

export const GLOSSARY: Record<string, string> = {
  Elevation: "Angle above the local horizontal plane (0°). Negative = below it.",
  Azimuth: "Compass direction, 0° = north, 90° = east, measured clockwise.",
  "Terrain horizon": "The skyline made by real terrain in a given direction, from LOLA elevation data.",
  Clearance: "Body elevation minus the terrain horizon at the body's azimuth.",
  "Sunlit (terrain-aware)": "Centre of the solar disc above the terrain horizon.",
  "Earth visible": "Geometric line of sight to Earth's centre. Not a radio link.",
  "Smooth Moon": "Reference case with no terrain: horizon at 0° elevation.",
  Earthset: "Moment the Earth's centre drops below the terrain horizon.",
  "Lunar day": "One synodic day ≈ 29.5 Earth days: ~2 weeks of sun, ~2 weeks of night at low latitudes.",
};

export const ABOUT_COMPUTED = [
  "Computed from data: Sun/Earth azimuth & elevation (JPL Horizons), terrain horizons (LOLA south-polar DEMs and SLDEM2015), sunlit/Earth-visible states, countdowns, daily and 30-day statistics, globe light direction and Earth direction (sub-solar / sub-Earth points).",
  "Illustrative only: the Moon\u2019s surface texture and shading detail, the 3D Sun and Earth models\u2019 sizes and distances (their directions are computed), Earth\u2019s rotation, and the decorative background stars.",
];

export const CREDITS = [
  "Lunar topography: LOLA south-polar DEMs (NASA GSFC PGDA; Barker et al. 2023, Planet. Sci. J. 4, 183; data DOI 10.60903/gsfcpgda-lola-spole) and SLDEM2015 (LOLA + SELENE TC; Barker et al. 2016, Icarus 273, 346-355).",
  "Ephemerides: JPL Horizons System, NASA/JPL Solar System Dynamics Group (DE441).",
  "Moon texture: NASA SVS CGI Moon Kit (Ernie Wright; LROC WAC mosaic + LOLA), svs.gsfc.nasa.gov/4720.",
  "Earth model texture: NASA Earth Observatory Blue Marble Next Generation (R. St\u00f6ckli, NASA GSFC).",
  "Site coordinates: NASA NSSDCA (Apollo) and the LROC team, Arizona State University (robotic landers).",
  "Built by team VNI for the NASA Space Apps Challenge 2026 “Lunar Landing Site Navigator”. Not endorsed by NASA.",
];

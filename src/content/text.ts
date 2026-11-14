/** All scientific copy in one reviewed place (science owner: R2).
 *  SV-8 copy audit: no "safe", "optimal", "approved", "guaranteed",
 *  "best site" claims anywhere; DTE is always "geometric line of sight". */

export const DTE_DISCLAIMER =
  "Earth above the horizon means geometric line of sight to the Earth's centre only. " +
  "It is NOT a guarantee of a working radio link: real communication also depends on " +
  "terrain near the antenna, antenna pointing, hardware, power, relays and mission design.";

export const TERRAIN_BADGE = "Terrain-aware · LOLA DEM · JPL Horizons";

export const SMOOTH_NOTE =
  "“Smooth Moon” columns use a 0° horizon (the local horizontal plane, no terrain) " +
  "for comparison, so the effect of real terrain is visible.";

export const LIMITATIONS: string[] = [
  "Terrain horizons come from LOLA elevation maps: 20 m/pixel within 20 km of the site, 80 m to the edge of the 80°S grid, 240 m beyond, out to 300 km. The maps' effective resolution is coarser where LOLA tracks were interpolated (the value used is shown per site).",
  "Boulders, small craters below the map resolution, and the lander itself are not modelled. The evaluated point sits 2 m above the local surface (a configurable, team-chosen stand-in for a deck or mast; results are for that point, not a specific vehicle).",
  "“Sunlit” means the centre of the solar disc is above the terrain horizon (visible fraction ≥ 0.5). The horizon is treated as straight across the Sun's 0.27° half-degree disc.",
  "Earth visibility uses the Earth's centre. " + DTE_DISCLAIMER,
  "Sun and Earth directions are linearly interpolated between 30-minute JPL Horizons samples (checked error ≤ 0.01° for elevation on a sample day). Events shorter than 10 minutes can be missed.",
  "IM-1's published coordinates have 2-decimal precision (~300 m). Moving the site by 300 m changes parts of its horizon by up to ~4.3° (measured), so treat IM-1's exact windows with care. IM-2's coordinates are 4-decimal.",
  "Globe surface shading is illustrative: NASA's CGI Moon Kit texture is “optimized for aesthetics, not science”. The light DIRECTION is computed (sub-solar point from JPL Horizons); the Earth sprite is not to scale.",
  "Times are UTC. Mission status notes are “as of” their stated date and may have changed.",
  "This is a student project for NASA Space Apps Challenge 2026. It is not NASA-endorsed, not mission-planning software, and it makes no landing-safety or site-suitability claims.",
];

export const METHOD_SUMMARY: string[] = [
  "Positions: JPL Horizons (DE441 ephemeris), apparent azimuth/elevation of the Sun and Earth for an observer at the site in the Moon's mean-Earth frame; airless (no refraction), 30-minute samples, 2026-11-01 to 2027-11-01 UTC.",
  "Terrain horizon: for each of 3600 azimuths, the maximum elevation angle of LOLA DEM terrain along the great circle out to 300 km, including lunar curvature, for an observer 2 m above the DEM surface. Range convergence checked (300→500 km changed nothing at 4 decimals).",
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
  "Computed from data: Sun/Earth azimuth & elevation (JPL Horizons), terrain horizons (LOLA DEMs), sunlit/Earth-visible states, countdowns, daily and 30-day statistics, globe light direction and Earth direction (sub-solar / sub-Earth points).",
  "Illustrative only: the Moon's surface texture and shading detail, the Earth sprite's size, the star field.",
];

export const CREDITS = [
  "Lunar topography: LOLA south-polar DEMs, NASA GSFC Planetary Geodesy Data Archive - Barker et al. 2023, Planet. Sci. J. 4, 183 (data DOI 10.60903/gsfcpgda-lola-spole).",
  "Ephemerides: JPL Horizons System, NASA/JPL Solar System Dynamics Group (DE441).",
  "Moon texture: NASA SVS CGI Moon Kit (Ernie Wright; LROC WAC mosaic + LOLA), svs.gsfc.nasa.gov/4720.",
  "Site coordinates: NASA NSSDCA (Apollo) and the LROC team, Arizona State University (robotic landers).",
  "Built by team VNI for the NASA Space Apps Challenge 2026 “Lunar Landing Site Navigator”. Not endorsed by NASA.",
];

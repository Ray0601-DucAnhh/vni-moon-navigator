/** Lunar coordinate helpers (framework-free; shared by app, pipeline, tests).
 *  Frame: planetocentric lat/lon (MOON_ME, DE421-aligned), lon east-positive.
 *  Sphere radius: 1,737,400 m (pck00011 / LOLA reference). */

export const R_MOON_M = 1_737_400;
export const DEG = Math.PI / 180;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Geocentric unit vector: x toward (0N,0E), z toward north pole. */
export function latLonToUnit(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  return {
    x: Math.cos(la) * Math.cos(lo),
    y: Math.cos(la) * Math.sin(lo),
    z: Math.sin(la),
  };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** South polar stereographic (metres), matching the PGDA LOLA products:
 *  x = rho*sin(lon), y = rho*cos(lon), rho = 2R*tan(pi/4 + lat/2).
 *  Verified against the IM-1 LROC position/elevation (plan v1.1 C7). */
export function southStereo(latDeg: number, lonDeg: number): { x: number; y: number } {
  const rho = 2 * R_MOON_M * Math.tan(Math.PI / 4 + (latDeg * DEG) / 2);
  return { x: rho * Math.sin(lonDeg * DEG), y: rho * Math.cos(lonDeg * DEG) };
}

export function southStereoInverse(x: number, y: number): { latDeg: number; lonDeg: number } {
  const rho = Math.hypot(x, y);
  const latDeg = (2 * Math.atan(rho / (2 * R_MOON_M)) - Math.PI / 2) / DEG;
  const lonDeg = Math.atan2(x, y) / DEG;
  return { latDeg, lonDeg };
}

/** Great-circle destination from (lat1,lon1) along azimuth azDeg (clockwise
 *  from north) over surface distance distM on the reference sphere. */
export function destination(
  lat1Deg: number,
  lon1Deg: number,
  azDeg: number,
  distM: number,
): { latDeg: number; lonDeg: number } {
  const s = distM / R_MOON_M;
  const la1 = lat1Deg * DEG;
  const az = azDeg * DEG;
  const sinLa2 = Math.sin(la1) * Math.cos(s) + Math.cos(la1) * Math.sin(s) * Math.cos(az);
  const la2 = Math.asin(Math.min(1, Math.max(-1, sinLa2)));
  const lo2 =
    lon1Deg * DEG +
    Math.atan2(Math.sin(az) * Math.sin(s) * Math.cos(la1), Math.cos(s) - Math.sin(la1) * sinLa2);
  let lonDeg = lo2 / DEG;
  if (lonDeg > 180) lonDeg -= 360;
  if (lonDeg < -180) lonDeg += 360;
  return { latDeg: la2 / DEG, lonDeg };
}

/** Elevation angle (deg) of point P (latP,lonP,heightP) seen from observer
 *  O (latO,lonO,heightO), relative to O's local horizontal plane.
 *  Heights in metres above the reference sphere. Includes lunar curvature;
 *  no refraction (airless). */
export function elevationOfPoint(
  latO: number,
  lonO: number,
  hO: number,
  latP: number,
  lonP: number,
  hP: number,
): number {
  const uO = latLonToUnit(latO, lonO);
  const uP = latLonToUnit(latP, lonP);
  const rO = R_MOON_M + hO;
  const rP = R_MOON_M + hP;
  const dx = rP * uP.x - rO * uO.x;
  const dy = rP * uP.y - rO * uO.y;
  const dz = rP * uP.z - rO * uO.z;
  const len = Math.hypot(dx, dy, dz);
  const up = (dx * uO.x + dy * uO.y + dz * uO.z) / len;
  return Math.asin(Math.min(1, Math.max(-1, up))) / DEG;
}

/** Horizon dip (deg, negative) for an observer hAboveM above a smooth sphere
 *  passing through the local surface at height hSurfaceM. */
export function smoothDipDeg(hSurfaceM: number, hAboveM: number): number {
  const r = R_MOON_M + hSurfaceM;
  return -Math.acos(r / (r + hAboveM)) / DEG;
}

export function normAz(azDeg: number): number {
  let a = azDeg % 360;
  if (a < 0) a += 360;
  return a;
}

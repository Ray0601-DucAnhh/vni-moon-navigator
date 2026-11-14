/** Mapping between lunar lat/lon and three.js scene coordinates, chosen so
 *  markers line up with the equirectangular CGI Moon Kit texture (centred on
 *  0 deg longitude) on a default three.js SphereGeometry:
 *    x = cos(lat) cos(lonE),  y = sin(lat),  z = -cos(lat) sin(lonE)
 *  Derived from SphereGeometry's UV construction; verified visually against
 *  Mare Crisium / Tycho in the visual QA pass (V-QA SV-9). */

import * as THREE from "three";

export const MOON_R = 1; // scene units

export function latLonToVec3(latDeg: number, lonDeg: number, r = MOON_R): THREE.Vector3 {
  const la = THREE.MathUtils.degToRad(latDeg);
  const lo = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(
    r * Math.cos(la) * Math.cos(lo),
    r * Math.sin(la),
    -r * Math.cos(la) * Math.sin(lo),
  );
}

/** Inverse of latLonToVec3 (scene coordinates -> lunar lat/lon). */
export function vec3ToLatLon(v: THREE.Vector3): { latDeg: number; lonDeg: number } {
  const n = v.clone().normalize();
  return {
    latDeg: THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, n.y)))),
    lonDeg: THREE.MathUtils.radToDeg(Math.atan2(-n.z, n.x)),
  };
}

export const CAMERA_FOV_DEG = 42;

/** Camera distance for the Sun & Earth view: far enough that the Sun model
 *  (2.45 units out, plus glow and caption) fits across the screen width.
 *  Landscape screens keep the 6.2 default; portrait phones need more. */
export function sunEarthViewDistance(aspect: number): number {
  const halfW = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEG / 2)) * Math.max(aspect, 0.3);
  return THREE.MathUtils.clamp(3.35 / halfW, 6.2, 19);
}

/** A camera direction from which the Moon, the Earth model and the Sun model
 *  are all in view. Both bodies lie close to the lunar equatorial plane, so
 *  the camera looks down onto that plane from ~33 deg south, oriented so the
 *  Earth-Sun spread runs left-right on screen (camera up = lunar north).
 *  The camera is put on the Earth-facing side so part of the near side shows. */
export function sunEarthViewDirection(
  subEarth: { lonE: number; lat: number },
  subSolar: { lonE: number; lat: number },
): { latDeg: number; lonDeg: number } {
  const e = latLonToVec3(subEarth.lat, subEarth.lonE, 1);
  const s = latLonToVec3(subSolar.lat, subSolar.lonE, 1);
  const up = new THREE.Vector3(0, 1, 0);
  // Axis along which Earth and Sun spread out (degenerate near full moon).
  const b = e.clone().sub(s);
  if (b.length() < 0.3) b.copy(e);
  b.y = 0;
  if (b.length() < 1e-6) b.set(1, 0, 0);
  b.normalize();
  const p = new THREE.Vector3().crossVectors(up, b).normalize();
  if (p.dot(e) < 0) p.negate();
  const v = p.multiplyScalar(0.84).add(up.clone().multiplyScalar(-0.55));
  return vec3ToLatLon(v);
}

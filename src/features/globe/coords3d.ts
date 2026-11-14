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

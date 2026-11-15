/** South-polar terrain map (Level B-grid) drawn on the globe: a cap mesh just
 *  above the surface whose shader maps every fragment back to the polar
 *  stereographic grid and colours the NEAREST node's year statistic (no
 *  smoothing between nodes, so the map shows exactly what a click analyses).
 *  Unlit on purpose: the pole is often in shadow in the globe lighting, and
 *  the map shows year statistics, not the current illumination. */

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useApp, type PolarLayer } from "../../store/appStore";
import { loadPolarStats } from "../../services/data/polar";
import { POLAR_HALF_M, POLAR_N, POLAR_RADIUS_M, POLAR_SCALE_MAX, POLAR_SPACING_M, nearestNode, nodeLatLon, type PolarStats } from "../../services/science/polarGrid";
import { latLonToVec3, vec3ToLatLon } from "./coords3d";
import { R_MOON_M } from "../../lib/coords";

/** Sequential ramps (one hue each, dark -> light on the dark map), in the
 *  app's reserved colours: amber = Sun, sky blue = Earth; "both" is neutral. */
export const POLAR_RAMPS: Record<Exclude<PolarLayer, "off">, [string, string, string]> = {
  sun: ["#120d05", "#b8730c", "#ffe7a8"],
  earth: ["#060c16", "#2d6fc0", "#d4e8ff"],
  both: ["#0b0d12", "#6f7686", "#f2f4f8"],
};
const CHANNEL: Record<Exclude<PolarLayer, "off">, number> = { sun: 0, earth: 1, both: 2 };

/** Cap covering the map disc: rho = 300 km -> colatitude 9.88 deg. */
const CAP_COLAT_RAD = THREE.MathUtils.degToRad(10.2);

const vert = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform sampler2D uData;
  uniform int uChannel;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform float uOpacity;
  uniform float uHalf;
  uniform float uSpacing;
  uniform float uN;
  uniform float uR2;
  uniform float uRadius;
  uniform float uScaleMax;
  varying vec3 vPos;
  void main() {
    // scene -> lunar body-fixed unit vector (inverse of latLonToVec3)
    vec3 u = vec3(vPos.x, -vPos.z, vPos.y);
    float w = uR2 / (1.0 - u.z);
    float xs = w * u.y;
    float ys = w * u.x;
    if (xs * xs + ys * ys > uRadius * uRadius) discard;
    float fi = (xs + uHalf) / uSpacing;
    float fj = (uHalf - ys) / uSpacing;
    float i = floor(fi + 0.5);
    float j = floor(fj + 0.5);
    if (i < 0.0 || j < 0.0 || i > uN - 1.0 || j > uN - 1.0) discard;
    vec4 d = texture2D(uData, vec2((i + 0.5) / uN, (j + 0.5) / uN));
    if (d.a < 0.5) discard;
    float v = clamp((uChannel == 0 ? d.r : uChannel == 1 ? d.g : d.b) * 255.0 / 200.0 / uScaleMax, 0.0, 1.0);
    vec3 c = v < 0.5 ? mix(uC0, uC1, v * 2.0) : mix(uC1, uC2, (v - 0.5) * 2.0);
    gl_FragColor = vec4(c, uOpacity);
    #include <colorspace_fragment>
  }
`;

function buildTexture(s: PolarStats): THREE.DataTexture {
  const data = new Uint8Array(POLAR_N * POLAR_N * 4);
  for (let k = 0; k < s.n; k++) {
    data[4 * k] = s.sun[k];
    data[4 * k + 1] = s.earth[k];
    data[4 * k + 2] = s.both[k];
    data[4 * k + 3] = s.height[k] === -32768 ? 0 : 255;
  }
  const t = new THREE.DataTexture(data, POLAR_N, POLAR_N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

export function PolarMapLayer() {
  const layer = useApp((s) => s.polarLayer);
  const openMapPoint = useApp((s) => s.openMapPoint);
  const setHover = useApp((s) => s.setPolarHover);
  const [tex, setTex] = useState<THREE.DataTexture | null>(null);

  useEffect(() => {
    if (layer === "off" || tex) return;
    let alive = true;
    loadPolarStats().then((s) => alive && setTex(buildTexture(s))).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [layer, tex]);

  // The material is created here (not as a JSX <shaderMaterial>) so the
  // uniforms object the shader reads is exactly the one updated below.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: {
          uData: { value: null },
          uChannel: { value: 0 },
          uC0: { value: new THREE.Color() },
          uC1: { value: new THREE.Color() },
          uC2: { value: new THREE.Color() },
          uOpacity: { value: 0.88 },
          uHalf: { value: POLAR_HALF_M / R_MOON_M },
          uSpacing: { value: POLAR_SPACING_M / R_MOON_M },
          uN: { value: POLAR_N },
          uR2: { value: 2 },
          uRadius: { value: POLAR_RADIUS_M / R_MOON_M },
          uScaleMax: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    if (layer === "off") return;
    const u = material.uniforms;
    u.uData.value = tex;
    u.uChannel.value = CHANNEL[layer];
    u.uScaleMax.value = POLAR_SCALE_MAX[layer];
    const [a, b, c] = POLAR_RAMPS[layer];
    (u.uC0.value as THREE.Color).set(a);
    (u.uC1.value as THREE.Color).set(b);
    (u.uC2.value as THREE.Color).set(c);
  }, [layer, tex, material]);

  if (layer === "off" || !tex) return null;

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const ll = vec3ToLatLon(e.point);
    return nearestNode(ll.latDeg, ll.lonDeg) ? ll : null;
  };

  return (
    <mesh
      name="polar-map"
      material={material}
      renderOrder={2}
      onClick={(e) => {
        const ll = pick(e);
        if (!ll) return;
        e.stopPropagation();
        openMapPoint(ll.latDeg, ll.lonDeg);
      }}
      onPointerMove={(e) => {
        const ll = pick(e);
        setHover(ll);
        document.body.style.cursor = ll ? "crosshair" : "";
      }}
      onPointerOut={() => {
        setHover(null);
        document.body.style.cursor = "";
      }}
    >
      <sphereGeometry args={[1.0012, 256, 48, 0, Math.PI * 2, Math.PI - CAP_COLAT_RAD, CAP_COLAT_RAD]} />
    </mesh>
  );
}

/** Small crosshair at the analysed map point (the grid node actually used). */
export function MapPointMarker() {
  const mapPoint = useApp((s) => s.mapPoint);
  const panel = useApp((s) => s.rightPanel);
  if (!mapPoint || panel !== "mappoint") return null;
  const nn = nearestNode(mapPoint.latDeg, mapPoint.lonDeg);
  const ll = nn ? nodeLatLon(nn.i, nn.j) : mapPoint;
  const pos = latLonToVec3(ll.latDeg, ll.lonDeg, 1.004);
  return (
    <group position={pos} name="map-point-marker">
      <Billboard>
        <mesh>
          <ringGeometry args={[0.006, 0.0095, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.0095, 0.0125, 32]} />
          <meshBasicMaterial color="#05070d" transparent opacity={0.8} depthTest={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

/** Simple illustrative 3D Sun and Earth models.
 *
 *  DIRECTIONS are computed: the Sun model lies along the Moon-centred
 *  direction to the sub-solar point and the Earth model along the direction
 *  to the sub-Earth point (JPL Horizons, geocentric quantities 14/15 - the same
 *  verified series that lights the globe).
 *  SIZES and DISTANCES are NOT to scale (true Earth: ~3.7 Moon radii wide at
 *  ~221 Moon radii; Sun: ~400x farther). Earth's rotation and clouds are not
 *  modelled. The Earth is lit by the same computed sunlight, so its phase as
 *  seen from the Moon is qualitatively right.
 *
 *  To keep the Moon and markers readable, a model fades when it sits between
 *  the camera and the Moon. */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { latLonToVec3 } from "./coords3d";
import { useApp } from "../../store/appStore";
import type { SiteData } from "../../services/data/useSiteData";

const EARTH_DIST = 2.0; // scene units (Moon radius = 1) - illustrative, NOT to scale
const EARTH_R = 0.14;
const SUN_DIST = 2.45;
const SUN_R = 0.15;

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,236,190,1)");
  grd.addColorStop(0.18, "rgba(255,206,120,0.85)");
  grd.addColorStop(0.45, "rgba(245,166,35,0.22)");
  grd.addColorStop(1, "rgba(245,166,35,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** True when the Moon (unit sphere at the origin) lies between the camera
 *  and the model centre. */
function behindMoon(camera: THREE.Camera, modelPos: THREE.Vector3): boolean {
  const c = camera.position;
  const d = modelPos.clone().sub(c);
  const len = d.length();
  d.divideScalar(len);
  const t = -c.dot(d); // ray parameter of closest approach to the origin
  if (t <= 0 || t >= len) return false;
  return c.clone().addScaledVector(d, t).length() < 1;
}

/** Opacity factor: ~0.12 when the model is in front of the Moon's disc
 *  from the camera's point of view, 1 otherwise. */
function occlusionFade(camera: THREE.Camera, modelPos: THREE.Vector3): number {
  const camPos = camera.position;
  const toMoon = camPos.clone().negate(); // camera -> Moon centre (origin)
  const toModel = modelPos.clone().sub(camPos);
  if (toModel.length() >= toMoon.length()) return 1; // model behind Moon depth
  const ang = toMoon.angleTo(toModel);
  const moonAngR = Math.asin(Math.min(1, 1.15 / toMoon.length())); // Moon disc + margin
  if (ang >= moonAngR) return 1;
  return 0.12 + 0.88 * (ang / moonAngR) ** 3;
}

export function SunEarthModels({ data }: { data: SiteData }) {
  const utcMs = useApp((s) => s.utcMs);
  const show = useApp((s) => s.showEarthDir);
  const { camera } = useThree();
  const earthTex = useTexture("/textures/earth_bluemarble_1k.jpg");
  const glowTex = useMemo(makeGlowTexture, []);
  useEffect(() => {
    earthTex.colorSpace = THREE.SRGBColorSpace;
  }, [earthTex]);

  const { earthDir, sunDir } = useMemo(() => {
    const se = data.subEarth(utcMs);
    const ss = data.subSolar(utcMs);
    return { earthDir: latLonToVec3(se.lat, se.lonE, 1), sunDir: latLonToVec3(ss.lat, ss.lonE, 1) };
  }, [data, utcMs]);

  const earthPos = useMemo(() => earthDir.clone().multiplyScalar(EARTH_DIST), [earthDir]);
  const sunPos = useMemo(() => sunDir.clone().multiplyScalar(SUN_DIST), [sunDir]);
  // Captions hang just below each model (camera up = lunar north), clear of
  // the sphere and the Sun's glow at any zoom.
  const earthCaptionPos = useMemo(() => earthPos.clone().add(new THREE.Vector3(0, -EARTH_R * 1.35, 0)), [earthPos]);
  const sunCaptionPos = useMemo(() => sunPos.clone().add(new THREE.Vector3(0, -SUN_R * 2.2, 0)), [sunPos]);

  const earthMat = useRef<THREE.MeshStandardMaterial>(null);
  const sunMat = useRef<THREE.MeshBasicMaterial>(null);
  const glowMat = useRef<THREE.SpriteMaterial>(null);
  const earthLineMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#4fa3ff", transparent: true, opacity: 0.45 }), []);
  const sunLineMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#f5a623", transparent: true, opacity: 0.35 }), []);
  const earthLabel = useRef<HTMLDivElement>(null);
  const sunLabel = useRef<HTMLDivElement>(null);

  const earthLine = useMemo(
    () => new THREE.BufferGeometry().setFromPoints([earthDir.clone().multiplyScalar(1.03), earthDir.clone().multiplyScalar(EARTH_DIST - EARTH_R * 1.4)]),
    [earthDir],
  );
  const sunLine = useMemo(
    () => new THREE.BufferGeometry().setFromPoints([sunDir.clone().multiplyScalar(1.03), sunDir.clone().multiplyScalar(SUN_DIST - SUN_R * 1.6)]),
    [sunDir],
  );

  useFrame(() => {
    const fe = occlusionFade(camera, earthPos);
    const fs = occlusionFade(camera, sunPos);
    if (earthMat.current) earthMat.current.opacity = fe;
    if (sunMat.current) sunMat.current.opacity = fs;
    if (glowMat.current) glowMat.current.opacity = 0.9 * fs;
    earthLineMat.opacity = 0.45 * fe;
    sunLineMat.opacity = 0.35 * fs;
    // HTML captions ignore the depth buffer, so hide them when the Moon
    // itself blocks the line of sight to the model.
    if (earthLabel.current) earthLabel.current.style.opacity = behindMoon(camera, earthPos) ? "0" : String(fe);
    if (sunLabel.current) sunLabel.current.style.opacity = behindMoon(camera, sunPos) ? "0" : String(fs);
  });

  if (!show) return null;
  const labelStyle = (color: string): React.CSSProperties => ({
    color,
    fontSize: 11,
    whiteSpace: "nowrap",
    textShadow: "0 1px 4px #000",
    background: "rgba(5, 7, 13, 0.55)",
    padding: "1px 7px 2px",
    borderRadius: 8,
    pointerEvents: "none",
    textAlign: "center",
    lineHeight: 1.25,
  });
  return (
    <group>
      {/* Earth */}
      <primitive object={new THREE.Line(earthLine, earthLineMat)} />
      <mesh position={earthPos} name="earth-model">
        <sphereGeometry args={[EARTH_R, 48, 48]} />
        <meshStandardMaterial ref={earthMat} map={earthTex} roughness={0.85} metalness={0} transparent />
      </mesh>
      <Html position={earthCaptionPos} center zIndexRange={[12, 10]}>
        <div ref={earthLabel} style={{ ...labelStyle("#4fa3ff"), transform: "translateY(50%)" }}>
          Earth<br />
          <span style={{ color: "#808a9e", fontSize: 10 }}>direction computed<br />not to scale</span>
        </div>
      </Html>

      {/* Sun */}
      <primitive object={new THREE.Line(sunLine, sunLineMat)} />
      <mesh position={sunPos} name="sun-model">
        <sphereGeometry args={[SUN_R, 32, 32]} />
        <meshBasicMaterial ref={sunMat} color="#ffd88a" transparent toneMapped={false} />
      </mesh>
      <sprite position={sunPos} scale={[SUN_R * 6, SUN_R * 6, 1]}>
        <spriteMaterial ref={glowMat} map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <Html position={sunCaptionPos} center zIndexRange={[12, 10]}>
        <div ref={sunLabel} style={{ ...labelStyle("#f5a623"), transform: "translateY(50%)" }}>
          Sun<br />
          <span style={{ color: "#808a9e", fontSize: 10 }}>direction computed<br />not to scale</span>
        </div>
      </Html>
    </group>
  );
}

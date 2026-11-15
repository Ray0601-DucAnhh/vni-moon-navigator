/** The 3D Moon: textured sphere, computed sub-solar lighting, Earth/Sun
 *  direction indicators, site markers, camera focus animation. */

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, OrbitControls, useTexture } from "@react-three/drei";
import { SunEarthModels } from "./SunEarthModels";
import { SpaceBackground } from "./SpaceBackground";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CAMERA_FOV_DEG, latLonToVec3, sunEarthViewDistance } from "./coords3d";
import { useApp } from "../../store/appStore";
import type { Site, SiteImage } from "../../types";
import type { SiteData } from "../../services/data/useSiteData";

const MARKER_COLORS: Record<Site["category"], string> = {
  "Landed - CLPS": "#8b7cf7",
  "Landed - historic crewed": "#efeadf",
  "Landed - other national program": "#2fbfad",
};

function MoonMesh({ onReady }: { onReady?: () => void }) {
  const tex = useTexture("/textures/moon_color_2k.jpg");
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const { gl } = useThree();
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    onReady?.();
    // Upgrade to the 4k texture in the background.
    new THREE.TextureLoader().loadAsync("/textures/moon_color_4k.jpg").then((t4) => {
      t4.colorSpace = THREE.SRGBColorSpace;
      t4.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      if (matRef.current) {
        matRef.current.map = t4;
        matRef.current.needsUpdate = true;
      }
    }).catch(() => undefined);
  }, [tex, gl, onReady]);
  return (
    <mesh name="moon">
      <sphereGeometry args={[1, 128, 128]} />
      <meshStandardMaterial ref={matRef} map={tex} roughness={0.95} metalness={0} />
    </mesh>
  );
}

function SunLight({ data }: { data: SiteData }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  const utcMs = useApp((s) => s.utcMs);
  useEffect(() => {
    if (!ref.current) return;
    const ss = data.subSolar(utcMs);
    ref.current.position.copy(latLonToVec3(ss.lat, ss.lonE, 8));
  }, [utcMs, data]);
  return (
    <>
      <directionalLight ref={ref} name="sun-light" intensity={3.4} color="#fff6e8" />
      <ambientLight intensity={0.09} />
    </>
  );
}

const PHOTO_R = 0.036; // photo disc radius in scene units (Moon radius = 1)

/** Category shape (the original marker); also the fallback when a photo fails. */
function ShapeMarker({ site, color, size }: { site: Site; color: string; size: number }) {
  return site.category === "Landed - CLPS" ? (
    <mesh rotation={[0, 0, Math.PI / 4]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} userData={{ baseOpacity: 0.95 }} />
    </mesh>
  ) : site.category === "Landed - historic crewed" ? (
    <mesh>
      <ringGeometry args={[size * 0.55, size * 0.8, 24]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} userData={{ baseOpacity: 0.9 }} />
    </mesh>
  ) : (
    <mesh>
      <circleGeometry args={[size * 0.62, 3]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} userData={{ baseOpacity: 0.9 }} />
    </mesh>
  );
}

/** Round lander photo inside a ring in the category colour. */
function PhotoMarker({ url, color }: { url: string; color: string }) {
  const tex = useTexture(url);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
  }, [tex]);
  return (
    <>
      <mesh>
        <circleGeometry args={[PHOTO_R * 1.3, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} userData={{ baseOpacity: 0.95 }} />
      </mesh>
      <mesh position={[0, 0, 0.0004]}>
        <circleGeometry args={[PHOTO_R, 40]} />
        <meshBasicMaterial map={tex} transparent opacity={1} toneMapped={false} userData={{ baseOpacity: 1 }} />
      </mesh>
    </>
  );
}

class MarkerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Markers({ sites, images }: { sites: Site[]; images: Record<string, SiteImage> }) {
  const selectSite = useApp((s) => s.selectSite);
  const setHover = useApp((s) => s.setHover);
  const selectedId = useApp((s) => s.selectedSiteId);
  const hoveredId = useApp((s) => s.hoveredSiteId);
  const setPanel = useApp((s) => s.setPanel);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  // Dim markers on the far hemisphere; block their pointer events.
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const camDir = camera.position.clone().normalize();
    for (const child of g.children) {
      // Keep markers at a roughly constant on-screen size when zooming.
      const d = camera.position.distanceTo(child.position);
      (child as THREE.Group).scale.setScalar(THREE.MathUtils.clamp(d * 0.5, 0.18, 1.1));
      const facing = (child.userData.unit as THREE.Vector3).dot(camDir) > 0.08;
      child.userData.facing = facing;
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.material) {
          const mat = m.material as THREE.MeshBasicMaterial;
          if (mat.userData.baseOpacity !== undefined) {
            mat.opacity = facing ? mat.userData.baseOpacity : mat.userData.baseOpacity * 0.18;
          }
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {sites.map((s) => {
        const unit = latLonToVec3(s.latDeg, s.lonDeg, 1);
        const pos = unit.clone().multiplyScalar(1.012);
        const color = MARKER_COLORS[s.category];
        const isSel = selectedId === s.id;
        const isHover = hoveredId === s.id;
        const size = s.analysed ? 0.03 : 0.018;
        const icon = images[s.id]?.icon;
        return (
          <group key={s.id} position={pos} userData={{ unit }}>
            <Billboard>
              {/* Invisible hit area (~24 px at default distance). */}
              <mesh
                onClick={(e) => {
                  e.stopPropagation();
                  const facing = (e.eventObject.parent?.userData.facing ?? true) as boolean;
                  if (!facing) return;
                  selectSite(s.id);
                  if (!s.analysed) setPanel("none");
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  if ((e.eventObject.parent?.userData.facing ?? true) as boolean) {
                    setHover(s.id);
                    document.body.style.cursor = "pointer";
                  }
                }}
                onPointerOut={() => {
                  setHover(null);
                  document.body.style.cursor = "";
                }}
              >
                <circleGeometry args={[0.055, 16]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              {/* Visible marker: lander photo in a category-coloured ring; category shape as fallback. */}
              {icon ? (
                <MarkerBoundary fallback={<ShapeMarker site={s} color={color} size={size} />}>
                  <Suspense fallback={<ShapeMarker site={s} color={color} size={size} />}>
                    <PhotoMarker url={icon} color={color} />
                  </Suspense>
                </MarkerBoundary>
              ) : (
                <ShapeMarker site={s} color={color} size={size} />
              )}
              {(isSel || isHover) && (
                <mesh>
                  <ringGeometry args={icon ? [PHOTO_R * 1.45, PHOTO_R * 1.75, 40] : [size * 1.35, size * 1.6, 32]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.85} userData={{ baseOpacity: 0.85 }} />
                </mesh>
              )}
            </Billboard>
            {(isSel || isHover) && (
              <Html center position={[0, icon ? PHOTO_R * 2.35 : 0.07, 0]} zIndexRange={[14, 13]} style={{ pointerEvents: "none" }}>
                <div
                  style={{
                    fontSize: 11.5,
                    whiteSpace: "nowrap",
                    background: "rgba(10,14,24,0.85)",
                    border: "1px solid rgba(140,160,200,0.2)",
                    padding: "2px 8px",
                    borderRadius: 99,
                    textShadow: "0 1px 3px #000",
                  }}
                >
                  {s.shortName}
                  {!s.analysed && <span style={{ color: "#808a9e" }}> · context</span>}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Eases the camera toward a requested lat/lon while preserving distance. */
function FocusController({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const target = useApp((s) => s.cameraTarget);
  const { camera } = useThree();
  const animRef = useRef<{ nonce: number; done: boolean }>({ nonce: -1, done: true });
  useFrame((_, dt) => {
    if (!target || (animRef.current.nonce === target.nonce && animRef.current.done)) return;
    if (animRef.current.nonce !== target.nonce) animRef.current = { nonce: target.nonce, done: false };
    // Easing rates are per 60 Hz frame, scaled by the real frame time so slow
    // (software-rendered) devices still reach the target in about a second.
    const f = Math.min(dt, 0.25) * 60;
    const cur = camera.position.length();
    const dist = target.dist ? cur + (target.dist - cur) * (1 - 0.85 ** f) : cur;
    const want = latLonToVec3(target.latDeg, target.lonDeg, 1).multiplyScalar(dist);
    camera.position.lerp(want, 1 - 0.88 ** f);
    camera.lookAt(0, 0, 0);
    controls.current?.update();
    if (camera.position.distanceTo(want) < dist * 0.004 && (!target.dist || Math.abs(cur - target.dist) < 0.02)) animRef.current.done = true;
  });
  return null;
}

/** Orbit controls; the zoom-out limit leaves room for the Sun & Earth view,
 *  which needs a larger distance on portrait screens. */
function Controls({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const size = useThree((s) => s.size);
  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={1.35}
      maxDistance={Math.max(7, sunEarthViewDistance(size.width / Math.max(1, size.height)) + 0.5)}
      zoomSpeed={0.7}
      rotateSpeed={0.55}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

/** QA-only, read-only: with ?debug=1, exposes the scene positions of the Sun
 *  and Earth models and the light, so tests can check the 3D directions
 *  against the ephemeris numerically. Does nothing otherwise. */
function DebugHook() {
  const { scene } = useThree();
  const on = useRef(typeof location !== "undefined" && new URLSearchParams(location.search).has("debug"));
  // Published on <html data-vni-*> (the DOM is visible to external test
  // tools; page globals are not). Updated every frame only in debug mode.
  useFrame(() => {
    if (!on.current) return;
    const ds = document.documentElement.dataset;
    for (const [key, name] of [["vniEarth", "earth-model"], ["vniSun", "sun-model"], ["vniLight", "sun-light"]] as const) {
      const o = scene.getObjectByName(name);
      if (!o) continue;
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      ds[key] = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
    }
  });
  return null;
}

export function MoonScene({ data, images = {}, onReady }: { data: SiteData; images?: Record<string, SiteImage>; onReady: () => void }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const selectSite = useApp((s) => s.selectSite);
  const [dpr] = useState<[number, number]>([1, 2]);
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [2.25, -1.95, 3.05], fov: CAMERA_FOV_DEG, near: 0.01, far: 60 }}
      onPointerMissed={() => selectSite(null)}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#05070d"]} />
      <Suspense fallback={null}>
        <MoonMesh onReady={onReady} />
      </Suspense>
      <SunLight data={data} />
      <Suspense fallback={null}>
        <SunEarthModels data={data} />
      </Suspense>
      <Markers sites={data.sites} images={images} />
      <SpaceBackground />
      <Controls controlsRef={controlsRef} />
      <FocusController controls={controlsRef} />
      <DebugHook />
    </Canvas>
  );
}

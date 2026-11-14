/** The 3D Moon: textured sphere, computed sub-solar lighting, Earth/Sun
 *  direction indicators, site markers, camera focus animation. */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, OrbitControls, Stars, useTexture } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { latLonToVec3 } from "./coords3d";
import { useApp } from "../../store/appStore";
import type { Site } from "../../types";
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
      <directionalLight ref={ref} intensity={3.4} color="#fff6e8" />
      <ambientLight intensity={0.09} />
    </>
  );
}

function DirectionIndicators({ data }: { data: SiteData }) {
  const utcMs = useApp((s) => s.utcMs);
  const show = useApp((s) => s.showEarthDir);
  const { earthDir, sunDir } = useMemo(() => {
    const se = data.subEarth(utcMs);
    const ss = data.subSolar(utcMs);
    return { earthDir: latLonToVec3(se.lat, se.lonE, 1), sunDir: latLonToVec3(ss.lat, ss.lonE, 1) };
  }, [data, utcMs]);
  const earthLine = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      earthDir.clone().multiplyScalar(1.03),
      earthDir.clone().multiplyScalar(1.62),
    ]);
    return g;
  }, [earthDir]);
  const sunLine = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      sunDir.clone().multiplyScalar(1.03),
      sunDir.clone().multiplyScalar(1.5),
    ]);
    return g;
  }, [sunDir]);
  if (!show) return null;
  return (
    <group>
      <primitive object={new THREE.Line(earthLine, new THREE.LineBasicMaterial({ color: "#4fa3ff", transparent: true, opacity: 0.8 }))} />
      <mesh position={earthDir.clone().multiplyScalar(1.68)}>
        <sphereGeometry args={[0.034, 24, 24]} />
        <meshBasicMaterial color="#4fa3ff" />
      </mesh>
      {/* Label sits between the globe edge and the sprite, so whenever the
          sprite is on-screen the label almost always is too (pass-1 item 5). */}
      <Html position={earthDir.clone().multiplyScalar(1.38)} center zIndexRange={[12, 10]} style={{ pointerEvents: "none" }}>
        <div style={{ color: "#4fa3ff", fontSize: 11, whiteSpace: "nowrap", textShadow: "0 1px 4px #000" }}>
          Earth (not to scale)
        </div>
      </Html>
      <primitive object={new THREE.Line(sunLine, new THREE.LineBasicMaterial({ color: "#f5a623", transparent: true, opacity: 0.55 }))} />
      <Html position={sunDir.clone().multiplyScalar(1.36)} center zIndexRange={[12, 10]} style={{ pointerEvents: "none" }}>
        <div style={{ color: "#f5a623", fontSize: 11, whiteSpace: "nowrap", textShadow: "0 1px 4px #000" }}>
          Sun direction
        </div>
      </Html>
    </group>
  );
}

function Markers({ sites }: { sites: Site[] }) {
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
              {/* Visible marker: diamond (analysed) or ring/triangle by category. */}
              {s.category === "Landed - CLPS" ? (
                <mesh rotation={[0, 0, Math.PI / 4]}>
                  <planeGeometry args={[size, size]} />
                  <meshBasicMaterial color={color} transparent opacity={0.95} userData={{ baseOpacity: 0.95 }} />
                </mesh>
              ) : s.category === "Landed - historic crewed" ? (
                <mesh>
                  <ringGeometry args={[size * 0.55, size * 0.8, 24]} />
                  <meshBasicMaterial color={color} transparent opacity={0.9} userData={{ baseOpacity: 0.9 }} />
                </mesh>
              ) : (
                <mesh>
                  <circleGeometry args={[size * 0.62, 3]} />
                  <meshBasicMaterial color={color} transparent opacity={0.9} userData={{ baseOpacity: 0.9 }} />
                </mesh>
              )}
              {(isSel || isHover) && (
                <mesh>
                  <ringGeometry args={[size * 1.35, size * 1.6, 32]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.85} userData={{ baseOpacity: 0.85 }} />
                </mesh>
              )}
            </Billboard>
            {(isSel || isHover) && (
              <Html center position={[0, 0.07, 0]} zIndexRange={[14, 13]} style={{ pointerEvents: "none" }}>
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
  useFrame(() => {
    if (!target || (animRef.current.nonce === target.nonce && animRef.current.done)) return;
    if (animRef.current.nonce !== target.nonce) animRef.current = { nonce: target.nonce, done: false };
    const dist = camera.position.length();
    const want = latLonToVec3(target.latDeg, target.lonDeg, 1).multiplyScalar(dist);
    camera.position.lerp(want, 0.12);
    camera.lookAt(0, 0, 0);
    controls.current?.update();
    if (camera.position.distanceTo(want) < dist * 0.004) animRef.current.done = true;
  });
  return null;
}

function AutoRotate({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const interacted = useRef(false);
  useEffect(() => {
    const stop = () => {
      interacted.current = true;
    };
    window.addEventListener("pointerdown", stop, { once: true });
    window.addEventListener("keydown", stop, { once: true });
    return () => {
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
    };
  }, []);
  useFrame((_, dt) => {
    if (!interacted.current && controls.current) {
      // gentle idle rotation until first interaction
      const c = controls.current;
      c.setAzimuthalAngle(c.getAzimuthalAngle() + dt * 0.03);
      c.update();
    }
  });
  return null;
}

export function MoonScene({ data, onReady }: { data: SiteData; onReady: () => void }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const selectSite = useApp((s) => s.selectSite);
  const [dpr] = useState<[number, number]>([1, 2]);
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [1.6, -1.4, 2.2], fov: 42, near: 0.01, far: 60 }}
      onPointerMissed={() => selectSite(null)}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#05070d"]} />
      <Suspense fallback={null}>
        <MoonMesh onReady={onReady} />
      </Suspense>
      <SunLight data={data} />
      <DirectionIndicators data={data} />
      <Markers sites={data.sites} />
      <Stars radius={30} depth={20} count={2600} factor={2.2} saturation={0} fade speed={0.3} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={1.35}
        maxDistance={6}
        zoomSpeed={0.7}
        rotateSpeed={0.55}
        enableDamping
        dampingFactor={0.08}
      />
      <FocusController controls={controlsRef} />
      <AutoRotate controls={controlsRef} />
    </Canvas>
  );
}

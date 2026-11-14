/** Restrained decorative star field. NOT a star map: positions are
 *  pseudo-random (fixed seed) and carry no scientific meaning - stated in the
 *  About dialog. Faint, sparse points plus two slightly brighter stars with a
 *  soft halo. Rendered far behind the Moon (radius 40), no depth writes, so it
 *  can never cover the Moon, markers, labels (HTML) or controls (DOM). */

import { useMemo } from "react";
import * as THREE from "three";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starLayer(count: number, seed: number, radius: number, tints: [number, number, number][], dimMin: number, dimMax: number) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // uniform on the sphere
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    pos.set([radius * r * Math.cos(a), radius * z, radius * r * Math.sin(a)], i * 3);
    const tint = tints[Math.floor(rnd() * tints.length)];
    const b = dimMin + (dimMax - dimMin) * rnd() ** 2; // most stars faint
    col.set([tint[0] * b, tint[1] * b, tint[2] * b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function haloTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.12, "rgba(225,235,255,0.55)");
  grd.addColorStop(0.4, "rgba(190,210,255,0.10)");
  grd.addColorStop(1, "rgba(190,210,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const TINTS: [number, number, number][] = [
  [1, 1, 1],
  [0.86, 0.91, 1],
  [1, 0.94, 0.84],
];

export function SpaceBackground() {
  const faint = useMemo(() => starLayer(1500, 7, 40, TINTS, 0.18, 0.55), []);
  const mid = useMemo(() => starLayer(160, 11, 40, TINTS, 0.45, 0.8), []);
  const halo = useMemo(haloTexture, []);
  // Two slightly brighter details, placed away from the default view centre.
  const brights = useMemo(
    () => [new THREE.Vector3(-26, 15, -24), new THREE.Vector3(24, -11, 27)].map((v) => v.normalize().multiplyScalar(39)),
    [],
  );
  return (
    <group renderOrder={-10}>
      <points geometry={faint}>
        <pointsMaterial size={1.15} sizeAttenuation={false} vertexColors transparent opacity={0.9} depthWrite={false} />
      </points>
      <points geometry={mid}>
        <pointsMaterial size={1.8} sizeAttenuation={false} vertexColors transparent opacity={0.9} depthWrite={false} />
      </points>
      {brights.map((p, i) => (
        <sprite key={i} position={p} scale={[1.5, 1.5, 1]}>
          <spriteMaterial map={halo} transparent opacity={i === 0 ? 0.75 : 0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

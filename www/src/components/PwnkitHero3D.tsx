'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

/**
 * The pwnkit fang character in 3D.
 * SVG path: M8 12 L16 6 L24 12 L24 22 L20 26 L16 22 L12 26 L8 22Z
 * Two eyes at (13,16) and (19,16), r=1.5
 * Normalized to center around origin.
 */

const CRIMSON = '#DC2626';

// Convert the SVG viewBox coords (6..26 x 5..27) to centered coords
// SVG center is roughly (16, 16), so offset by that
function svgToLocal(x: number, y: number): [number, number] {
  // Normalize: SVG spans ~16 units wide, ~20 tall
  // Center at (16, 16), flip Y, scale to ~2 units
  const scale = 0.12;
  return [(x - 16) * scale, -(y - 16) * scale];
}

const Shield = () => {
  const groupRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const scanRef = useRef<THREE.Line>(null);
  const particlesRef = useRef<THREE.Points>(null);

  // The fang outline as a line loop
  const outlineGeo = useMemo(() => {
    // M8,12 L16,6 L24,12 L24,22 L20,26 L16,22 L12,26 L8,22 Z
    const svgPoints: [number, number][] = [
      [8, 12], [16, 6], [24, 12], [24, 22],
      [20, 26], [16, 22], [12, 26], [8, 22],
      [8, 12], // close
    ];
    const points3d = svgPoints.map(([x, y]) => {
      const [lx, ly] = svgToLocal(x, y);
      return new THREE.Vector3(lx, ly, 0);
    });
    return new THREE.BufferGeometry().setFromPoints(points3d);
  }, []);

  // Inner outline (slightly smaller for depth)
  const innerGeo = useMemo(() => {
    const svgPoints: [number, number][] = [
      [8, 12], [16, 6], [24, 12], [24, 22],
      [20, 26], [16, 22], [12, 26], [8, 22],
      [8, 12],
    ];
    const s = 0.85;
    const points3d = svgPoints.map(([x, y]) => {
      const [lx, ly] = svgToLocal(x, y);
      return new THREE.Vector3(lx * s, ly * s, 0.05);
    });
    return new THREE.BufferGeometry().setFromPoints(points3d);
  }, []);

  // Floating particles
  const particleGeo = useMemo(() => {
    const count = 120;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.5 + Math.random() * 2;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  // Scan line
  const scanGeo = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.2, 0, 0.02),
      new THREE.Vector3(1.2, 0, 0.02),
    ]);
  }, []);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();

    if (groupRef.current) {
      // Gentle float + mouse follow
      groupRef.current.rotation.y = Math.sin(t * 0.3) * 0.12 + pointer.x * 0.08;
      groupRef.current.rotation.x = Math.cos(t * 0.25) * 0.04 + pointer.y * -0.04;
      groupRef.current.position.y = Math.sin(t * 0.5) * 0.03;
      // Breathing scale
      const breathe = 1 + Math.sin(t * 1.2) * 0.015;
      groupRef.current.scale.setScalar(breathe * 1.8);
    }

    // Eye blink
    const blinkCycle = 2.5;
    const blinkPhase = t % blinkCycle;
    const blinkDur = 0.12;
    let eyeScale = 1;
    if (blinkPhase < blinkDur) {
      eyeScale = blinkPhase < blinkDur / 2
        ? 1 - (blinkPhase / (blinkDur / 2))
        : (blinkPhase - blinkDur / 2) / (blinkDur / 2);
    }
    if (leftEyeRef.current) leftEyeRef.current.scale.set(1, eyeScale, 1);
    // Right eye blinks slightly after
    const blinkPhase2 = (t + 0.03) % blinkCycle;
    let eyeScale2 = 1;
    if (blinkPhase2 < blinkDur) {
      eyeScale2 = blinkPhase2 < blinkDur / 2
        ? 1 - (blinkPhase2 / (blinkDur / 2))
        : (blinkPhase2 - blinkDur / 2) / (blinkDur / 2);
    }
    if (rightEyeRef.current) rightEyeRef.current.scale.set(1, eyeScale2, 1);

    // Scan line
    if (scanRef.current) {
      const scanY = Math.sin(t * 0.6) * 1.2;
      scanRef.current.position.y = scanY;
      const mat = scanRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = (1 - Math.abs(scanY) / 1.2) * 0.35;
    }

    // Particles
    if (particlesRef.current) {
      particlesRef.current.rotation.y = t * 0.03;
    }
  });

  // Eye positions in local coords
  const [leftEyeX, leftEyeY] = svgToLocal(13, 16);
  const [rightEyeX, rightEyeY] = svgToLocal(19, 16);

  return (
    <group ref={groupRef}>
      {/* Main outline */}
      <line geometry={outlineGeo}>
        <lineBasicMaterial color={CRIMSON} transparent opacity={0.6} />
      </line>

      {/* Inner outline */}
      <line geometry={innerGeo}>
        <lineBasicMaterial color={CRIMSON} transparent opacity={0.15} />
      </line>

      {/* Left eye */}
      <mesh ref={leftEyeRef} position={[leftEyeX, leftEyeY, 0.02]}>
        <circleGeometry args={[0.018, 24]} />
        <meshBasicMaterial color={CRIMSON} transparent opacity={0.8} />
      </mesh>

      {/* Right eye */}
      <mesh ref={rightEyeRef} position={[rightEyeX, rightEyeY, 0.02]}>
        <circleGeometry args={[0.018, 24]} />
        <meshBasicMaterial color={CRIMSON} transparent opacity={0.8} />
      </mesh>

      {/* Scan line */}
      <line ref={scanRef} geometry={scanGeo}>
        <lineBasicMaterial color={CRIMSON} transparent opacity={0.3} />
      </line>

      {/* Particles */}
      <points ref={particlesRef} geometry={particleGeo}>
        <pointsMaterial
          color={CRIMSON}
          size={0.015}
          transparent
          opacity={0.2}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
};

export default function PwnkitHero3D() {
  return (
    <div className="absolute inset-0 z-0" style={{ opacity: 0.45 }}>
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Shield />
      </Canvas>
    </div>
  );
}

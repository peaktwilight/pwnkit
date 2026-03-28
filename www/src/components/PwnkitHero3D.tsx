'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';

const CRIMSON = '#DC2626';
const CRIMSON_DARK = '#7F1D1D';
const BODY_DARK = '#1C1917';
const EYE_COLOR = '#DC2626';

// Pixel grid of the pwnkit fang character (20x24)
// 0=empty, 1=outline, 2=fill(dark), 3=eye
const GRID: number[][] = [
  //
  [0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,2,2,2,2,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,2,2,2,2,2,2,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,2,2,2,2,2,2,2,2,1,1,0,0,0,0],
  [0,0,0,1,1,2,2,2,2,2,2,2,2,2,2,1,1,0,0,0],
  [0,0,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,0,0],
  [0,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,0],
  [1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1],
  [1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1],
  [1,1,2,2,2,2,3,3,2,2,2,2,3,3,2,2,2,2,1,1],
  [1,1,2,2,2,2,3,3,2,2,2,2,3,3,2,2,2,2,1,1],
  [1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1],
  [1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1],
  [1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1],
  [1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1],
  [0,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,0],
  [0,0,1,1,2,2,2,2,2,1,1,2,2,2,2,2,1,1,0,0],
  [0,0,0,1,1,2,2,2,1,1,1,1,2,2,2,1,1,0,0,0],
  [0,0,0,0,1,1,2,1,1,0,0,1,1,2,1,1,0,0,0,0],
  [0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0],
];

const ROWS = GRID.length;
const COLS = GRID[0].length;
const VOXEL_SIZE = 0.12;
const DEPTH_LAYERS = 4;

function getColor(type: number): string {
  switch (type) {
    case 1: return CRIMSON;
    case 2: return BODY_DARK;
    case 3: return EYE_COLOR;
    default: return CRIMSON;
  }
}

const VoxelCharacter = () => {
  const groupRef = useRef<THREE.Group>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetRotation = useRef({ x: 0, y: 0 });

  // Listen to mouse across the whole page
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Build instanced meshes for each voxel type
  const { outlineData, fillData, eyeData } = useMemo(() => {
    const outline: THREE.Vector3[] = [];
    const fill: THREE.Vector3[] = [];
    const eyes: THREE.Vector3[] = [];

    const offsetX = -(COLS * VOXEL_SIZE) / 2;
    const offsetY = (ROWS * VOXEL_SIZE) / 2;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const type = GRID[row][col];
        if (type === 0) continue;

        const x = col * VOXEL_SIZE + offsetX + VOXEL_SIZE / 2;
        const y = -row * VOXEL_SIZE + offsetY - VOXEL_SIZE / 2;

        // Add depth layers
        const layers = type === 1 ? DEPTH_LAYERS : (type === 3 ? DEPTH_LAYERS + 1 : DEPTH_LAYERS - 1);
        for (let z = 0; z < layers; z++) {
          const pos = new THREE.Vector3(x, y, z * VOXEL_SIZE - (DEPTH_LAYERS * VOXEL_SIZE) / 2);
          if (type === 1) outline.push(pos);
          else if (type === 2) fill.push(pos);
          else if (type === 3) eyes.push(pos);
        }
      }
    }

    return { outlineData: outline, fillData: fill, eyeData: eyes };
  }, []);

  // Create instanced meshes
  const outlineMesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95);
    const mat = new THREE.MeshStandardMaterial({ color: CRIMSON, roughness: 0.4, metalness: 0.3 });
    const mesh = new THREE.InstancedMesh(geo, mat, outlineData.length);
    const dummy = new THREE.Object3D();
    outlineData.forEach((pos, i) => {
      dummy.position.copy(pos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [outlineData]);

  const fillMesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95);
    const mat = new THREE.MeshStandardMaterial({ color: BODY_DARK, roughness: 0.6, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(geo, mat, fillData.length);
    const dummy = new THREE.Object3D();
    fillData.forEach((pos, i) => {
      dummy.position.copy(pos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [fillData]);

  const eyeMesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95);
    const mat = new THREE.MeshStandardMaterial({
      color: EYE_COLOR,
      roughness: 0.2,
      metalness: 0.5,
      emissive: EYE_COLOR,
      emissiveIntensity: 0.5,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, eyeData.length);
    const dummy = new THREE.Object3D();
    eyeData.forEach((pos, i) => {
      dummy.position.copy(pos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [eyeData]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Smooth follow mouse
    targetRotation.current.y = mouseRef.current.x * 0.4;
    targetRotation.current.x = mouseRef.current.y * -0.25;

    if (groupRef.current) {
      groupRef.current.rotation.y += (targetRotation.current.y - groupRef.current.rotation.y) * 0.05;
      groupRef.current.rotation.x += (targetRotation.current.x - groupRef.current.rotation.x) * 0.05;
      // Breathing
      const breathe = 1 + Math.sin(t * 1.2) * 0.01;
      groupRef.current.scale.setScalar(breathe);
      // Gentle float
      groupRef.current.position.y = Math.sin(t * 0.6) * 0.02;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={outlineMesh} />
      <primitive object={fillMesh} />
      <primitive object={eyeMesh} />
    </group>
  );
};

export default function PwnkitHero3D() {
  return (
    <div className="mx-auto mb-4" style={{ width: '240px', height: '260px' }}>
      <Canvas
        camera={{ position: [0, 0, 4], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 3, 5]} intensity={1.2} color="#ffffff" />
        <directionalLight position={[-2, -1, 3]} intensity={0.4} color="#DC2626" />
        <VoxelCharacter />
      </Canvas>
    </div>
  );
}

'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';

const CRIMSON = '#DC2626';
const BODY_DARK = '#1C1917';
const EYE_COLOR = '#DC2626';

// Pixel grid of the pwnkit fang character (22 rows x 20 cols)
// 0=empty, 1=outline, 2=fill(dark), 3=eye
const GRID: number[][] = [
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
  // --- legs start here (row 17+) ---
  [0,0,1,1,2,2,2,2,2,1,1,2,2,2,2,2,1,1,0,0],
  [0,0,0,1,1,2,2,2,1,1,1,1,2,2,2,1,1,0,0,0],
  [0,0,0,0,1,1,2,1,1,0,0,1,1,2,1,1,0,0,0,0],
  [0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0],
];

const ROWS = GRID.length;
const COLS = GRID[0].length;
const VS = 0.12; // voxel size
const DEPTH = 4;  // depth layers
const LEG_START_ROW = 17;
const MID_COL = 10; // split left/right legs

interface VoxelData {
  positions: THREE.Vector3[];
  color: string;
  emissive?: boolean;
}

function buildVoxels(
  rowStart: number, rowEnd: number,
  colStart: number, colEnd: number,
  offsetX: number, offsetY: number,
): { outline: THREE.Vector3[]; fill: THREE.Vector3[]; eyes: THREE.Vector3[] } {
  const outline: THREE.Vector3[] = [];
  const fill: THREE.Vector3[] = [];
  const eyes: THREE.Vector3[] = [];

  for (let row = rowStart; row < rowEnd; row++) {
    for (let col = colStart; col < colEnd; col++) {
      if (col >= COLS) continue;
      const type = GRID[row]?.[col];
      if (!type) continue;

      const x = col * VS + offsetX + VS / 2;
      const y = -row * VS + offsetY - VS / 2;
      const layers = type === 1 ? DEPTH : (type === 3 ? DEPTH + 1 : DEPTH - 1);

      for (let z = 0; z < layers; z++) {
        const pos = new THREE.Vector3(x, y, z * VS - (DEPTH * VS) / 2);
        if (type === 1) outline.push(pos);
        else if (type === 2) fill.push(pos);
        else if (type === 3) eyes.push(pos);
      }
    }
  }
  return { outline, fill, eyes };
}

function createInstancedMesh(
  positions: THREE.Vector3[],
  color: string,
  opts?: { emissive?: boolean; roughness?: number; metalness?: number }
): THREE.InstancedMesh | null {
  if (positions.length === 0) return null;
  const geo = new THREE.BoxGeometry(VS * 0.93, VS * 0.93, VS * 0.93);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.roughness ?? 0.4,
    metalness: opts?.metalness ?? 0.3,
    ...(opts?.emissive ? { emissive: color, emissiveIntensity: 0.5 } : {}),
  });
  const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((pos, i) => {
    dummy.position.copy(pos);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const VoxelCharacter = () => {
  const bodyRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const wholeRef = useRef<THREE.Group>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const offX = -(COLS * VS) / 2;
  const offY = (ROWS * VS) / 2;

  // Body voxels (rows 0 to LEG_START_ROW)
  const bodyData = useMemo(() => {
    return buildVoxels(0, LEG_START_ROW, 0, COLS, offX, offY);
  }, [offX, offY]);

  const bodyMeshes = useMemo(() => {
    return {
      outline: createInstancedMesh(bodyData.outline, CRIMSON),
      fill: createInstancedMesh(bodyData.fill, BODY_DARK, { roughness: 0.6, metalness: 0.1 }),
      eyes: createInstancedMesh(bodyData.eyes, EYE_COLOR, { emissive: true, roughness: 0.2, metalness: 0.5 }),
    };
  }, [bodyData]);

  // Left leg voxels (rows LEG_START_ROW+, cols 0 to MID_COL)
  const leftLegMeshes = useMemo(() => {
    const { outline, fill } = buildVoxels(LEG_START_ROW, ROWS, 0, MID_COL, offX, offY);
    return {
      outline: createInstancedMesh(outline, CRIMSON),
      fill: createInstancedMesh(fill, BODY_DARK, { roughness: 0.6, metalness: 0.1 }),
    };
  }, [offX, offY]);

  // Right leg voxels (rows LEG_START_ROW+, cols MID_COL to COLS)
  const rightLegMeshes = useMemo(() => {
    const { outline, fill } = buildVoxels(LEG_START_ROW, ROWS, MID_COL, COLS, offX, offY);
    return {
      outline: createInstancedMesh(outline, CRIMSON),
      fill: createInstancedMesh(fill, BODY_DARK, { roughness: 0.6, metalness: 0.1 }),
    };
  }, [offX, offY]);

  // Pivot point for legs (where they connect to body)
  const legPivotY = -LEG_START_ROW * VS + offY;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    // Whole group: smooth mouse follow rotation
    if (wholeRef.current) {
      const targetY = mx * 0.35;
      const targetX = my * -0.2;
      wholeRef.current.rotation.y += (targetY - wholeRef.current.rotation.y) * 0.05;
      wholeRef.current.rotation.x += (targetX - wholeRef.current.rotation.x) * 0.05;
      // Breathing
      const breathe = 1 + Math.sin(t * 1.2) * 0.01;
      wholeRef.current.scale.setScalar(breathe);
      // Float
      wholeRef.current.position.y = Math.sin(t * 0.6) * 0.02;
    }

    // Leg sway based on mouse X + subtle idle animation
    const idleSway = Math.sin(t * 1.5) * 0.06;
    const mouseSway = mx * 0.15;
    const sway = idleSway + mouseSway;

    if (leftLegRef.current) {
      const targetRot = sway + Math.sin(t * 2) * 0.03;
      leftLegRef.current.rotation.z += (targetRot - leftLegRef.current.rotation.z) * 0.08;
    }

    if (rightLegRef.current) {
      // Same direction, slightly delayed for natural feel
      const targetRot = sway + Math.sin(t * 2 + 0.3) * 0.03;
      rightLegRef.current.rotation.z += (targetRot - rightLegRef.current.rotation.z) * 0.07;
    }

    // Eye blink — squash Y scale of eye voxels
    if (bodyMeshes.eyes && bodyData.eyes.length > 0) {
      const blinkCycle = 2.5;
      const blinkDur = 0.15;
      const bp = t % blinkCycle;
      let eyeScaleY = 1;
      if (bp < blinkDur) {
        eyeScaleY = bp < blinkDur / 2
          ? 1 - (bp / (blinkDur / 2))
          : (bp - blinkDur / 2) / (blinkDur / 2);
        eyeScaleY = Math.max(0.05, eyeScaleY);
      }

      const dummy = new THREE.Object3D();
      bodyData.eyes.forEach((pos, i) => {
        dummy.position.copy(pos);
        dummy.scale.set(1, eyeScaleY, 1);
        dummy.updateMatrix();
        bodyMeshes.eyes!.setMatrixAt(i, dummy.matrix);
      });
      bodyMeshes.eyes.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={wholeRef}>
      {/* Body */}
      <group ref={bodyRef}>
        {bodyMeshes.outline && <primitive object={bodyMeshes.outline} />}
        {bodyMeshes.fill && <primitive object={bodyMeshes.fill} />}
        {bodyMeshes.eyes && <primitive object={bodyMeshes.eyes} />}
      </group>

      {/* Left leg — pivots from hip */}
      <group position={[0, legPivotY, 0]}>
        <group ref={leftLegRef}>
          <group position={[0, -legPivotY, 0]}>
            {leftLegMeshes.outline && <primitive object={leftLegMeshes.outline} />}
            {leftLegMeshes.fill && <primitive object={leftLegMeshes.fill} />}
          </group>
        </group>
      </group>

      {/* Right leg — pivots from hip */}
      <group position={[0, legPivotY, 0]}>
        <group ref={rightLegRef}>
          <group position={[0, -legPivotY, 0]}>
            {rightLegMeshes.outline && <primitive object={rightLegMeshes.outline} />}
            {rightLegMeshes.fill && <primitive object={rightLegMeshes.fill} />}
          </group>
        </group>
      </group>
    </group>
  );
};

export default function PwnkitHero3D() {
  return (
    <div className="mx-auto mb-4" style={{ width: '240px', height: '280px' }}>
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

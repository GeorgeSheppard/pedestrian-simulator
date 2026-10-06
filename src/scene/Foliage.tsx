import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, IcosahedronGeometry, type InstancedMesh, Matrix4 } from 'three';

export interface Clump {
  position: [number, number, number];
  radius: number;
  colour: string;
}

/** Lots of faceted green clumps, drawn in one go: planting on walls, in planters, in trees. */
export function Clumps({ clumps }: { clumps: Clump[] }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new IcosahedronGeometry(1, 0), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const colour = new Color();
    clumps.forEach((clump, i) => {
      matrix.makeScale(clump.radius, clump.radius * 0.85, clump.radius);
      matrix.setPosition(...clump.position);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, colour.set(clump.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [clumps]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, clumps.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.85} flatShading />
    </instancedMesh>
  );
}

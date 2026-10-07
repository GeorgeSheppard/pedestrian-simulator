import { useLayoutEffect, useMemo, useRef } from 'react';
import { type InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { shopDoors } from '@/data/shops';

/** How far the shopfronts stand out from the walls, so the doors sit on their faces. */
const SHOPFRONT_FACE = 0.37;
const DOOR_WIDTH = 1.4;
const DOOR_HEIGHT = 2.5;
const FRAME = 0.12;

/**
 * The shops' open doors: a warmly lit doorway in a dark frame on each shopfront, where people go in
 * and come out.
 */
export function ShopDoors() {
  const frames = useRef<InstancedMesh>(null);
  const openings = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);

  useLayoutEffect(() => {
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const up = new Vector3(0, 1, 0);
    shopDoors.forEach((door, i) => {
      // A plane faces +z; turn it to face out of the wall.
      rotation.setFromAxisAngle(up, Math.atan2(door.normal[0], door.normal[1]));
      const at = (out: number, y: number) =>
        new Vector3(
          door.position[0] + door.normal[0] * out,
          y,
          door.position[1] + door.normal[1] * out
        );
      frames.current?.setMatrixAt(
        i,
        matrix.compose(
          at(SHOPFRONT_FACE, (DOOR_HEIGHT + FRAME) / 2),
          rotation,
          new Vector3(DOOR_WIDTH + FRAME * 2, DOOR_HEIGHT + FRAME, 1)
        )
      );
      openings.current?.setMatrixAt(
        i,
        matrix.compose(
          at(SHOPFRONT_FACE + 0.01, DOOR_HEIGHT / 2),
          rotation,
          new Vector3(DOOR_WIDTH, DOOR_HEIGHT, 1)
        )
      );
    });
    for (const mesh of [frames.current, openings.current]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  }, []);

  return (
    <group>
      <instancedMesh ref={frames} args={[geometry, undefined, shopDoors.length]}>
        <meshStandardMaterial color="#26272a" roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={openings} args={[geometry, undefined, shopDoors.length]}>
        <meshStandardMaterial
          color="#f6dfb2"
          emissive="#ffd38c"
          emissiveIntensity={0.55}
          roughness={0.6}
        />
      </instancedMesh>
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Euler, type InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { Simulation } from '@/sim/simulation';
import { clothes, skin } from './palette';

const CAPACITY = 300;

const BODY_RADIUS = 0.21;
const BODY_LENGTH = 0.95;
const HEAD_RADIUS = 0.17;
const BODY_CENTRE = BODY_RADIUS + BODY_LENGTH / 2;
const HEAD_CENTRE = BODY_RADIUS * 2 + BODY_LENGTH + HEAD_RADIUS * 0.9;
/** How high people bob with each step, in metres. */
const BOB = 0.05;

/** The crowd, drawn as two instanced meshes: a capsule body and a ball of a head each. */
export function Pedestrians({ simulation }: { simulation: Simulation }) {
  const bodies = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const { crowd } = simulation;

  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      position: new Vector3(),
      rotation: new Quaternion(),
      euler: new Euler(),
      scale: new Vector3(),
      colour: new Color(),
    }),
    []
  );

  useFrame(() => {
    if (!bodies.current || !heads.current) return;

    const { matrix, position, rotation, euler, scale, colour } = scratch;
    const people = crowd.pedestrians.slice(0, CAPACITY);
    people.forEach((person, i) => {
      const walking = person.indoors <= 0 && !person.leaving && !person.waiting;
      const lift = walking ? Math.abs(Math.sin(person.stride)) * BOB : 0;
      const sway = walking ? Math.sin(person.stride) * 0.06 : 0;
      rotation.setFromEuler(euler.set(0, -person.heading, sway));
      scale.setScalar(person.presence);

      position.set(person.position[0], BODY_CENTRE * person.presence + lift, person.position[1]);
      bodies.current!.setMatrixAt(i, matrix.compose(position, rotation, scale));
      bodies.current!.setColorAt(i, colour.set(pick(clothes, person.seed)));

      position.set(person.position[0], HEAD_CENTRE * person.presence + lift, person.position[1]);
      heads.current!.setMatrixAt(i, matrix.compose(position, rotation, scale));
      heads.current!.setColorAt(i, colour.set(pick(skin, person.seed * 7.3)));
    });

    for (const mesh of [bodies.current, heads.current]) {
      mesh.count = people.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, CAPACITY]} castShadow>
        <capsuleGeometry args={[BODY_RADIUS, BODY_LENGTH, 4, 10]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, CAPACITY]} castShadow>
        <sphereGeometry args={[HEAD_RADIUS, 12, 8]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.floor((seed % 1) * items.length)]!;
}

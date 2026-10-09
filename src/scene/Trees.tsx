import { useMemo } from 'react';
import type { Vec2 } from '@/sim/network';
import { type Clump, Clumps } from './Foliage';
import { seeded } from './random';

/** London plane foliage: olive and yellowish greens, lighter than the planting on walls. */
const PLANE_LEAVES = ['#6d823d', '#7a8f45', '#5f7536', '#86994e', '#71863f'];
const BARK = '#a59e86';

/**
 * A London plane: a pale, mottled trunk forking into a few big limbs, under a broad, loose crown
 * of olive-green clumps. `height` is to the top of the crown, in metres.
 */
export function PlaneTree({ position, height }: { position: Vec2; height: number }) {
  const { clumps, limbs } = useMemo(() => {
    const random = seeded(position.join());
    const crownBase = height * 0.42;
    const crownRadius = height * 0.36;
    const clumps: Clump[] = [];
    // Clumps over the surface of a rough dome, plus a few inside to fill it out.
    for (let i = 0; i < 26; i++) {
      const angle = random() * Math.PI * 2;
      const up = random();
      const spread = crownRadius * (0.45 + 0.55 * Math.sqrt(1 - up * up)) * (0.7 + random() * 0.3);
      clumps.push({
        position: [
          position[0] + Math.cos(angle) * spread,
          crownBase + crownRadius * 0.35 + up * (height - crownBase - crownRadius * 0.55),
          position[1] + Math.sin(angle) * spread,
        ],
        radius: crownRadius * (0.3 + random() * 0.18),
        colour: PLANE_LEAVES[Math.floor(random() * PLANE_LEAVES.length)]!,
      });
    }
    const limbs = Array.from({ length: 3 }, (_, i) => {
      const angle = (i / 3) * Math.PI * 2 + random();
      return { angle, lean: 0.45 + random() * 0.2 };
    });
    return { clumps, limbs };
  }, [position, height]);

  const trunk = height * 0.45;
  return (
    <group>
      <group position={[position[0], 0, position[1]]}>
        <mesh position={[0, trunk / 2, 0]} castShadow>
          <cylinderGeometry args={[height * 0.018, height * 0.026, trunk, 8]} />
          <meshStandardMaterial color={BARK} roughness={0.8} />
        </mesh>
        {limbs.map(({ angle, lean }) => (
          <group key={angle} position={[0, trunk * 0.85, 0]} rotation={[0, angle, lean]}>
            <mesh position={[0, height * 0.12, 0]} castShadow>
              <cylinderGeometry args={[height * 0.009, height * 0.014, height * 0.25, 6]} />
              <meshStandardMaterial color={BARK} roughness={0.8} />
            </mesh>
          </group>
        ))}
      </group>
      <Clumps clumps={clumps} />
    </group>
  );
}

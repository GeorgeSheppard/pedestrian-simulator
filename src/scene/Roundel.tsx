import { DoubleSide } from 'three';
import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import { insidePolygon } from './geometry';
import { colours } from './palette';

const RADIUS = 1;
const HEIGHT = 4.9;
/** How far along the facade from the entrance's corner the sign hangs. */
const ALONG = 2.2;
/** How far out from the wall, clearing the shopfront. */
const OUT = 0.65;

interface Sign {
  position: Vec2;
  /** Rotation about y that turns the sign to face out of the wall. */
  facing: number;
}

/** Where the Underground roundels go: on the facade beside each entrance at the station's corners. */
function signs(): Sign[] {
  const station = area.buildings.find((b) => b.kind === 'train_station');
  if (!station) return [];
  const footprint = station.footprint;
  const result: Sign[] = [];

  for (const entrance of area.places.filter((p) => p.kind === 'station')) {
    const index = footprint.findIndex(
      (p) => Math.hypot(p[0] - entrance.position[0], p[1] - entrance.position[1]) < 0.5
    );
    if (index === -1) continue;
    const corner = footprint[index]!;
    // Hang the sign on the longer of the two walls meeting at this corner.
    const neighbours = [
      footprint[(index + footprint.length - 1) % footprint.length]!,
      footprint[(index + 1) % footprint.length]!,
    ];
    const lengthTo = (p: Vec2) => Math.hypot(p[0] - corner[0], p[1] - corner[1]);
    const other =
      lengthTo(neighbours[0]!) > lengthTo(neighbours[1]!) ? neighbours[0]! : neighbours[1]!;
    const length = lengthTo(other);
    if (length < ALONG * 2) continue;
    const direction: Vec2 = [(other[0] - corner[0]) / length, (other[1] - corner[1]) / length];
    let normal: Vec2 = [direction[1], -direction[0]];
    const onWall: Vec2 = [corner[0] + direction[0] * ALONG, corner[1] + direction[1] * ALONG];
    if (insidePolygon([onWall[0] + normal[0], onWall[1] + normal[1]], footprint)) {
      normal = [-normal[0], -normal[1]];
    }
    result.push({
      position: [onWall[0] + normal[0] * OUT, onWall[1] + normal[1] * OUT],
      facing: Math.atan2(normal[0], normal[1]),
    });
  }
  return result;
}

const placed = signs();

/** The Underground roundel: a red ring with a blue bar across it, beside each entrance. */
export function Roundel() {
  return (
    <group>
      {placed.map(({ position, facing }) => (
        <group
          key={position.join()}
          position={[position[0], HEIGHT, position[1]]}
          rotation={[0, facing, 0]}
        >
          <mesh>
            <circleGeometry args={[RADIUS * 0.62, 32]} />
            <meshStandardMaterial color="#ffffff" side={DoubleSide} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <ringGeometry args={[RADIUS * 0.62, RADIUS, 40]} />
            <meshStandardMaterial color={colours.roundelRed} side={DoubleSide} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[RADIUS * 2.5, RADIUS * 0.42, 0.06]} />
            <meshStandardMaterial color={colours.roundelBlue} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

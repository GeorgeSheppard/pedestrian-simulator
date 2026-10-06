import { RoundedBox } from '@react-three/drei';
import type { Road } from '@/data/area';
import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import { besideRoad, isBlocked } from './geometry';
import { colours } from './palette';

const LAMP_SPACING = 16;
const LAMP_HEIGHT = 5.2;

const carriageways = area.roads.filter((r) => r.kind === 'carriageway');
const pedestrianStreets = area.roads.filter((r) => r.kind === 'pedestrian');

function nearCrossing(point: Vec2, distance: number) {
  return area.crossings.some(
    (c) => Math.hypot(c.position[0] - point[0], c.position[1] - point[1]) < distance
  );
}

/** Evenly spaced spots along both sides of some streets, skipping any that are blocked. */
function alongStreets(
  roads: Road[],
  spacing: number,
  side: (road: Road) => number,
  clearance: number
): { position: Vec2; heading: number }[] {
  const spots: { position: Vec2; heading: number }[] = [];
  for (const road of roads) {
    const length = Math.hypot(road.to[0] - road.from[0], road.to[1] - road.from[1]);
    for (let along = spacing / 2; along < length; along += spacing) {
      for (const sign of [-1, 1]) {
        const spot = besideRoad(road.from, road.to, along / length, sign * side(road));
        if (isBlocked(spot.position, clearance) || nearCrossing(spot.position, 4)) continue;
        if (
          spots.some(
            (s) =>
              Math.hypot(s.position[0] - spot.position[0], s.position[1] - spot.position[1]) <
              spacing / 2
          )
        )
          continue;
        spots.push(spot);
      }
    }
  }
  return spots;
}

const lamps = [
  ...alongStreets(carriageways, LAMP_SPACING, (r) => r.width / 2 + 0.8, 0.5),
  ...alongStreets(pedestrianStreets, LAMP_SPACING, (r) => r.width / 2 - 0.6, 0.5),
];
const trees = alongStreets(pedestrianStreets, 11, (r) => r.width / 2 - 1.6, 1.4).filter(
  (_, i) => i % 2 === 0
);

/** Street furniture and traffic: lamps, trees, bollards, a phone box, a cab and a van. */
export function Props() {
  const longAcre = carriageways;
  const vehicle = (index: number, t: number, lane: number) => {
    const road = longAcre[Math.min(index, longAcre.length - 1)]!;
    return besideRoad(road.from, road.to, t, lane);
  };
  const cab = vehicle(1, 0.3, -1.9);
  const van = vehicle(3, 0.6, 1.9);
  const secondCab = vehicle(1, 0.72, 1.9);
  const phoneBox = alongStreets(longAcre, 9, (r) => r.width / 2 + 1.4, 1).find(
    (s) => s.position[0] < -10 && s.position[1] < -10
  );

  return (
    <group>
      {lamps.map(({ position }) => (
        <Lamp key={position.join()} position={position} />
      ))}
      {trees.map(({ position }, i) => (
        <Tree key={position.join()} position={position} scale={0.85 + (i % 3) * 0.15} />
      ))}
      <Bollards />
      {phoneBox && <PhoneBox position={phoneBox.position} heading={phoneBox.heading} />}
      <Cab position={cab.position} heading={cab.heading} />
      <Cab position={secondCab.position} heading={secondCab.heading + Math.PI} />
      <Van position={van.position} heading={van.heading + Math.PI} />
    </group>
  );
}

function Lamp({ position }: { position: Vec2 }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.6, 10]} />
        <meshStandardMaterial color={colours.lamp} roughness={0.4} />
      </mesh>
      <mesh position={[0, LAMP_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, LAMP_HEIGHT, 8]} />
        <meshStandardMaterial color={colours.lamp} roughness={0.4} />
      </mesh>
      <mesh position={[0, LAMP_HEIGHT + 0.3, 0]}>
        <cylinderGeometry args={[0.22, 0.14, 0.5, 6]} />
        <meshStandardMaterial
          color={colours.lampGlow}
          emissive={colours.lampGlow}
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, LAMP_HEIGHT + 0.62, 0]} castShadow>
        <coneGeometry args={[0.3, 0.3, 6]} />
        <meshStandardMaterial color={colours.lamp} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Tree({ position, scale }: { position: Vec2; scale: number }) {
  return (
    <group position={[position[0], 0, position[1]]} scale={scale}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.5, 1.3]} />
        <meshStandardMaterial color={colours.lamp} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 2.4, 6]} />
        <meshStandardMaterial color={colours.trunk} roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.3, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshStandardMaterial color={colours.foliage} roughness={0.8} flatShading />
      </mesh>
    </group>
  );
}

/** A row of bollards across the mouth of each pedestrianised street, where it meets Long Acre. */
function Bollards() {
  const mouths = pedestrianStreets.flatMap((street) => {
    const touchesRoad = (point: Vec2) =>
      carriageways.some(
        (r) =>
          Math.hypot(r.to[0] - point[0], r.to[1] - point[1]) < 0.5 ||
          Math.hypot(r.from[0] - point[0], r.from[1] - point[1]) < 0.5
      );
    if (touchesRoad(street.to)) return [{ street, end: street.to, other: street.from }];
    if (touchesRoad(street.from)) return [{ street, end: street.from, other: street.to }];
    return [];
  });

  return (
    <group>
      {mouths.flatMap(({ street, end, other }) => {
        const length = Math.hypot(other[0] - end[0], other[1] - end[1]);
        const roadHalfWidth = carriageways[0]!.width / 2;
        const t = (roadHalfWidth + 1.2) / length;
        return [-3, -1.5, 0, 1.5, 3].map((offset) => {
          const { position } = besideRoad(end, other, t, offset);
          return (
            <mesh
              key={`${street.name}-${offset}`}
              position={[position[0], 0.45, position[1]]}
              castShadow
            >
              <cylinderGeometry args={[0.11, 0.13, 0.9, 8]} />
              <meshStandardMaterial color={colours.lamp} roughness={0.4} />
            </mesh>
          );
        });
      })}
    </group>
  );
}

function PhoneBox({ position, heading }: { position: Vec2; heading: number }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, -heading, 0]}>
      <RoundedBox args={[0.95, 2.5, 0.95]} radius={0.05} position={[0, 1.25, 0]} castShadow>
        <meshStandardMaterial color={colours.phoneBox} roughness={0.35} />
      </RoundedBox>
      <RoundedBox args={[1.05, 0.25, 1.05]} radius={0.08} position={[0, 2.6, 0]} castShadow>
        <meshStandardMaterial color={colours.phoneBox} roughness={0.35} />
      </RoundedBox>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[0.97, 1.3, 0.8]} />
        <meshStandardMaterial color={colours.glass} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Wheels({ length, width }: { length: number; width: number }) {
  return (
    <>
      {[-1, 1].flatMap((end) =>
        [-1, 1].map((side) => (
          <mesh
            key={`${end},${side}`}
            position={[end * length * 0.32, 0.36, side * (width / 2 - 0.05)]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.36, 0.36, 0.25, 14]} />
            <meshStandardMaterial color={colours.tyre} roughness={0.8} />
          </mesh>
        ))
      )}
    </>
  );
}

/** A London black cab: rounded body, tall glasshouse and a yellow "TAXI" light. */
function Cab({ position, heading }: { position: Vec2; heading: number }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, -heading, 0]}>
      <RoundedBox args={[4.5, 0.9, 1.8]} radius={0.25} position={[0, 0.8, 0]} castShadow>
        <meshStandardMaterial color={colours.cab} roughness={0.25} metalness={0.3} />
      </RoundedBox>
      <RoundedBox args={[2.5, 0.75, 1.7]} radius={0.2} position={[-0.25, 1.55, 0]} castShadow>
        <meshStandardMaterial color={colours.glass} roughness={0.15} metalness={0.4} />
      </RoundedBox>
      <RoundedBox args={[2.4, 0.12, 1.72]} radius={0.05} position={[-0.25, 1.92, 0]} castShadow>
        <meshStandardMaterial color={colours.cab} roughness={0.25} metalness={0.3} />
      </RoundedBox>
      <mesh position={[0.6, 2.05, 0]}>
        <boxGeometry args={[0.2, 0.14, 0.5]} />
        <meshStandardMaterial
          color={colours.lampGlow}
          emissive={colours.lampGlow}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      <Wheels length={4.5} width={1.8} />
    </group>
  );
}

function Van({ position, heading }: { position: Vec2; heading: number }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, -heading, 0]}>
      <RoundedBox args={[3.8, 2.3, 2]} radius={0.15} position={[-0.6, 1.5, 0]} castShadow>
        <meshStandardMaterial color={colours.van} roughness={0.35} />
      </RoundedBox>
      <RoundedBox args={[1.5, 1.5, 2]} radius={0.25} position={[1.9, 1.1, 0]} castShadow>
        <meshStandardMaterial color={colours.van} roughness={0.35} />
      </RoundedBox>
      <mesh position={[2.3, 1.45, 0]}>
        <boxGeometry args={[0.8, 0.6, 1.9]} />
        <meshStandardMaterial color={colours.glass} roughness={0.15} metalness={0.4} />
      </mesh>
      <Wheels length={5} width={2} />
    </group>
  );
}

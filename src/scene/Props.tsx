import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { Road } from '@/data/area';
import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import { type Clump, Clumps } from './Foliage';
import { besideRoad, faceRotation, faces, isBlocked, onFace } from './geometry';
import { colours, flowers, leaves } from './palette';
import { pick, seeded } from './random';
import { PlaneTree } from './Trees';
import { VehicleModel } from './Vehicles';

const LAMP_SPACING = 16;
const LAMP_HEIGHT = 6.4;

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
/**
 * The big London plane on the corner of Long Acre and Neal Street, in front of Odhams Walk,
 * diagonally opposite the station.
 */
const cornerPlane = (() => {
  const odhams = area.buildings.find((b) => b.name === 'Odhams Walk');
  if (!odhams) return null;
  // Its south-west corner, where it meets Long Acre and Neal Street.
  const corner = odhams.footprint.reduce((best, p) =>
    p[0] + -p[1] * 0.3 < best[0] + -best[1] * 0.3 ? p : best
  );
  const spot: Vec2 = [corner[0] + 2.8, corner[1] + 3.2];
  return isBlocked(spot, 0.5) ? null : spot;
})();

/**
 * The row of big timber planters down the station side of James Street, out on the setts, with a
 * no-entry sign at the Long Acre end, as in photos looking down James Street.
 */
const jamesStreetPlanters = (() => {
  const station = area.buildings.find((b) => b.kind === 'train_station');
  if (!station) return { planters: [], noEntry: null };
  const walls = faces(station.footprint)
    .filter((f) => f.street && f.normal[0] > 0.7 && f.length > 6)
    .sort((a, b) => Math.min(a.from[1], a.to[1]) - Math.min(b.from[1], b.to[1]));
  const planters: { position: Vec2; heading: number }[] = [];
  for (const wall of walls) {
    // Walk down James Street, away from Long Acre.
    const southwards = wall.to[1] > wall.from[1];
    for (let along = 3; along < wall.length - 1.5; along += 3.4) {
      const d = southwards ? along : wall.length - along;
      planters.push({ position: onFace(wall, d, 3.1), heading: faceRotation(wall) });
    }
  }
  const first = walls[0];
  const noEntry = first
    ? onFace(first, first.to[1] > first.from[1] ? 1 : first.length - 1, 3.1)
    : null;
  return {
    planters: planters.filter((p) => !isBlocked(p.position, 1)),
    noEntry: noEntry && !isBlocked(noEntry, 0.3) ? noEntry : null,
  };
})();

/** Timber planters of shrubs and flowers, round Regal House's corner, as in photos of it. */
const planterSpots = (() => {
  const regal = area.buildings.find((b) => b.name === 'Regal House');
  if (!regal) return [];
  return faces(regal.footprint)
    .filter((f) => f.street && f.length > 6)
    .flatMap((face) => {
      // Start from whichever end of the wall is the street corner nearest the station.
      const fromCorner =
        Math.hypot(face.from[0], face.from[1]) < Math.hypot(face.to[0], face.to[1]);
      return [1.6, 5].map((d) => onFace(face, fromCorner ? d : face.length - d, 1.3));
    })
    .filter((p) => !isBlocked(p, 0.6));
})();

/** Neal Street is lined with black cast-iron bollards along both sides. */
const nealStreetBollards = alongStreets(
  pedestrianStreets.filter((r) => r.name === 'Neal Street'),
  2.2,
  (r) => r.width / 2 - 0.9,
  0.3
);

const stationEntrances = area.places.filter((p) => p.kind === 'station').map((p) => p.position);
/** Spots on the pavement near the station's entrances, for its bins and map board. */
const nearStation = (offsets: Vec2[]) =>
  offsets
    .flatMap(([dx, dz]) => stationEntrances.map((e): Vec2 => [e[0] + dx, e[1] + dz]))
    .filter((p) => !isBlocked(p, 0.6))
    .filter((p, i, all) => all.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3) === i);
const bins = nearStation([
  [-3.5, -2.4],
  [3.2, 0.5],
]).slice(0, 3);
const mapBoard = nearStation([[2.6, 3.5]])[0];

/** Pedicabs wait for fares on James Street, just outside the station. */
const jamesStreet = pedestrianStreets.filter((r) => r.name === 'James Street');
const pedicabs = (jamesStreet.length > 1 ? [0.25, 0.55] : [])
  .map((t) => {
    const road = jamesStreet[1]!;
    for (const side of [2.6, -2.6]) {
      const spot = besideRoad(road.from, road.to, t, side);
      if (!isBlocked(spot.position, 1.2)) return spot;
    }
    return null;
  })
  .filter((spot) => spot !== null);

/**
 * Street furniture: lamps, trees, planters, bollards, bins, a phone box, pedicabs, and a van
 * unloading in one of Long Acre's loading bays.
 */
export function Props() {
  const longAcre = carriageways;
  // In the loading bay on the north side, between James Street and Neal Street.
  const bay = longAcre[3] ?? longAcre[0]!;
  const parked = besideRoad(bay.from, bay.to, 0.55, -(bay.width / 2 - 0.95));
  const phoneBox = alongStreets(longAcre, 9, (r) => r.width / 2 + 1.4, 1).find(
    (s) => s.position[0] < -10 && s.position[1] < -10
  );

  return (
    <group>
      {lamps.map(({ position }) => (
        <Lamp key={position.join()} position={position} />
      ))}
      {cornerPlane && <PlaneTree position={cornerPlane} height={16} />}
      {jamesStreetPlanters.planters.map(({ position, heading }, i) => (
        <Planter
          key={position.join()}
          position={position}
          seed={100 + i}
          size={[2.1, 0.8, 0.95]}
          heading={heading}
        />
      ))}
      {jamesStreetPlanters.noEntry && <NoEntrySign position={jamesStreetPlanters.noEntry} />}
      {planterSpots.map((position, i) => (
        <Planter key={position.join()} position={position} seed={i} />
      ))}
      <Bollards />
      {nealStreetBollards.map(({ position }) => (
        <Bollard key={position.join()} position={position} />
      ))}
      {bins.map((position) => (
        <Bin key={position.join()} position={position} />
      ))}
      {mapBoard && <MapBoard position={mapBoard} />}
      {pedicabs.map(({ position, heading }, i) => (
        <Pedicab
          key={position.join()}
          position={position}
          heading={heading}
          canopy={i % 2 === 0 ? colours.roundelRed : '#f2efe8'}
        />
      ))}
      {phoneBox && <PhoneBox position={phoneBox.position} heading={phoneBox.heading} />}
      <group
        position={[parked.position[0], 0, parked.position[1]]}
        rotation={[0, -parked.heading, 0]}
      >
        <VehicleModel kind="van" />
      </group>
    </group>
  );
}

/**
 * A Westminster lamp column: a heavy fluted base with a gold band, a tall slim black column, a
 * little bracket arm for signs, and a lantern under a dark cap with a gold finial.
 */
function Lamp({ position }: { position: Vec2 }) {
  const black = <meshStandardMaterial color={colours.lamp} roughness={0.35} metalness={0.3} />;
  const gold = <meshStandardMaterial color="#c9a23c" roughness={0.3} metalness={0.6} />;
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.22, 1.1, 12]} />
        {black}
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <cylinderGeometry args={[0.175, 0.175, 0.08, 12]} />
        {gold}
      </mesh>
      <mesh position={[0, LAMP_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.1, LAMP_HEIGHT, 8]} />
        {black}
      </mesh>
      <mesh position={[0.22, LAMP_HEIGHT - 1.3, 0]}>
        <boxGeometry args={[0.45, 0.04, 0.04]} />
        {black}
      </mesh>
      <mesh position={[0, LAMP_HEIGHT + 0.05, 0]}>
        <cylinderGeometry args={[0.1, 0.06, 0.12, 8]} />
        {black}
      </mesh>
      <mesh position={[0, LAMP_HEIGHT + 0.28, 0]}>
        <cylinderGeometry args={[0.2, 0.12, 0.36, 8]} />
        <meshStandardMaterial
          color={colours.lampGlow}
          emissive={colours.lampGlow}
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, LAMP_HEIGHT + 0.53, 0]} castShadow>
        <coneGeometry args={[0.25, 0.2, 8]} />
        {black}
      </mesh>
      <mesh position={[0, LAMP_HEIGHT + 0.7, 0]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        {gold}
      </mesh>
      <mesh position={[0, LAMP_HEIGHT + 0.82, 0]}>
        <coneGeometry args={[0.025, 0.18, 6]} />
        {gold}
      </mesh>
    </group>
  );
}

/** A no-entry sign: a red disc with a white bar, on a grey post. */
function NoEntrySign({ position }: { position: Vec2 }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
        <meshStandardMaterial color="#3b3e42" roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.25, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.04, 24]} />
        <meshStandardMaterial color="#d32a1f" roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.25, 0.075]}>
        <boxGeometry args={[0.5, 0.1, 0.02]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
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

function Bollard({ position }: { position: Vec2 }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.13, 0.9, 8]} />
        <meshStandardMaterial color={colours.poleDark} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.93, 0]} castShadow>
        <sphereGeometry args={[0.11, 8, 6]} />
        <meshStandardMaterial color={colours.poleDark} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** A Westminster litter bin: black, with a gold band. */
function Bin({ position }: { position: Vec2 }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.33, 1, 14]} />
        <meshStandardMaterial color="#1e2124" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.365, 0.365, 0.08, 14]} />
        <meshStandardMaterial color="#c9a23c" roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}

/** The station's blue map board, on two legs. */
function MapBoard({ position }: { position: Vec2 }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 1.35, 0]} castShadow>
        <boxGeometry args={[1, 1.5, 0.12]} />
        <meshStandardMaterial color="#1f3f93" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.2, 0.07]}>
        <planeGeometry args={[0.8, 1]} />
        <meshStandardMaterial color="#e9e6dc" roughness={0.5} />
      </mesh>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.3, 0]} castShadow>
          <boxGeometry args={[0.08, 0.6, 0.08]} />
          <meshStandardMaterial color={colours.poleDark} />
        </mesh>
      ))}
    </group>
  );
}

/** A pedicab: a bicycle pulling a two-seat carriage under a bright canopy. */
function Pedicab({
  position,
  heading,
  canopy,
}: {
  position: Vec2;
  heading: number;
  canopy: string;
}) {
  const frame = <meshStandardMaterial color="#2a2c30" roughness={0.4} metalness={0.4} />;
  const wheel = (x: number, z: number) => (
    <mesh position={[x, 0.33, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <torusGeometry args={[0.3, 0.04, 6, 16]} />
      {frame}
    </mesh>
  );
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, -heading, 0]}>
      {wheel(1.1, 0)}
      {wheel(-0.5, 0.55)}
      {wheel(-0.5, -0.55)}
      <mesh position={[0.45, 0.6, 0]} rotation={[0, 0, 0.25]} castShadow>
        <boxGeometry args={[1.4, 0.06, 0.06]} />
        {frame}
      </mesh>
      {/* The carriage: a bench seat, its back, and the canopy over it. */}
      <RoundedBox args={[0.7, 0.5, 1.2]} radius={0.06} position={[-0.5, 0.75, 0]} castShadow>
        <meshStandardMaterial color="#26282b" roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[0.15, 0.7, 1.2]} radius={0.05} position={[-0.85, 1.25, 0]} castShadow>
        <meshStandardMaterial color={canopy} roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[0.95, 0.08, 1.3]} radius={0.03} position={[-0.45, 1.95, 0]} castShadow>
        <meshStandardMaterial color={canopy} roughness={0.5} />
      </RoundedBox>
      {[-0.9, 0].flatMap((x) =>
        [-0.6, 0.6].map((z) => (
          <mesh key={`${x},${z}`} position={[x, 1.45, z]}>
            <cylinderGeometry args={[0.02, 0.02, 1, 4]} />
            {frame}
          </mesh>
        ))
      )}
    </group>
  );
}

/** A timber planter, planted with shrubs and a few flowers. */
function Planter({
  position,
  seed,
  size = [1.3, 0.9, 1.3],
  heading = 0,
}: {
  position: Vec2;
  seed: number;
  /** Length, height and depth, in metres. */
  size?: [number, number, number];
  heading?: number;
}) {
  const [length, height, depth] = size;
  const clumps = useMemo(() => {
    const random = seeded(`planter ${seed}`);
    const along: Vec2 = [Math.cos(-heading), Math.sin(-heading)];
    const across: Vec2 = [-along[1], along[0]];
    const spot = (spread: number): Vec2 => {
      const a = (random() - 0.5) * length * spread;
      const b = (random() - 0.5) * depth * spread;
      return [
        position[0] + along[0] * a + across[0] * b,
        position[1] + along[1] * a + across[1] * b,
      ];
    };
    const clumps: Clump[] = [];
    const shrubs = Math.round(length * depth * 4);
    for (let i = 0; i < shrubs; i++) {
      const [x, z] = spot(0.75);
      clumps.push({
        position: [x, height + 0.05 + random() * 0.45, z],
        radius: 0.3 + random() * 0.2,
        colour: pick(leaves, random()),
      });
    }
    for (let i = 0; i < shrubs * 1.2; i++) {
      const [x, z] = spot(0.85);
      clumps.push({
        position: [x, height + 0.4 + random() * 0.4, z],
        radius: 0.09 + random() * 0.05,
        colour: pick(flowers, random()),
      });
    }
    return clumps;
  }, [position, seed, length, height, depth, heading]);

  return (
    <group>
      <group position={[position[0], 0, position[1]]} rotation={[0, heading, 0]}>
        <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[length, height, depth]} />
          <meshStandardMaterial color="#5b4a3a" roughness={0.75} />
        </mesh>
        {/* Horizontal timber boards, and a darker capping rail. */}
        {[0.25, 0.5, 0.75].map((t) => (
          <mesh key={t} position={[0, height * t, 0]}>
            <boxGeometry args={[length + 0.01, 0.015, depth + 0.01]} />
            <meshStandardMaterial color="#3e3127" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, height + 0.02, 0]}>
          <boxGeometry args={[length + 0.08, 0.05, depth + 0.08]} />
          <meshStandardMaterial color="#3e3127" roughness={0.6} />
        </mesh>
      </group>
      <Clumps clumps={clumps} />
    </group>
  );
}

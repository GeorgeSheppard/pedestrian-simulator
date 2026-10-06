import { useMemo } from 'react';
import type { CanvasTexture } from 'three';
import type { Crossing, Road } from '@/data/area';
import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import { colours } from './palette';
import {
  BLOCK_TILE,
  BORDER_TILE,
  FLAG_TILE,
  SETT_TILE,
  blocksTexture,
  borderTexture,
  flagsTexture,
  settsTexture,
  tiled,
} from './surfaces';

const SLAB_DEPTH = 1.2;
const BASE_DEPTH = 2.4;
const BASE_INSET = 0.6;
const KERB_WIDTH = 0.3;
const KERB_HEIGHT = 0.1;
const LINE_WIDTH = 0.12;
const STRIPE_WIDTH = 0.5;
const CROSSING_LENGTH = 3;
/** The terracotta edging along each side of the carriageway. */
const BORDER_WIDTH = 0.45;
/** Loading bays along both sides of Long Acre, marked out in dashed white lines. */
const BAY_WIDTH = 1.9;
const BAY_DASH = 1.5;
const BAY_GAP = 0.9;

const carriageways = area.roads.filter((r) => r.kind === 'carriageway');
const pedestrianStreets = area.roads.filter((r) => r.kind === 'pedestrian');

/**
 * The slab the miniature stands on: paving flags on top; Long Acre's carriageway in coloured
 * concrete blocks, edged in terracotta, with granite kerbs, bay markings and the zebra crossing;
 * and the pedestrianised streets paved in setts.
 */
export function Ground() {
  const [width, depth] = area.size;
  const surfaces = useMemo(
    () => ({
      flags: flagsTexture(),
      setts: settsTexture(),
      blocks: blocksTexture(),
      border: borderTexture(),
    }),
    []
  );
  const pavement = useMemo(
    () => tiled(surfaces.flags, width, depth, FLAG_TILE),
    [surfaces, width, depth]
  );

  return (
    <group>
      <mesh position={[0, -SLAB_DEPTH / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[width, SLAB_DEPTH, depth]} />
        {/* Box faces are +x, -x, +y, -y, +z, -z. */}
        {[0, 1, 2, 3, 4, 5].map((face) => (
          <meshStandardMaterial
            key={face}
            attach={`material-${face}`}
            color={face === 2 ? '#ffffff' : colours.slabSide}
            map={face === 2 ? pavement : null}
            roughness={0.85}
          />
        ))}
      </mesh>
      {/* A darker, slightly inset base, so the slab reads as a model on a stand. */}
      <mesh position={[0, -SLAB_DEPTH - BASE_DEPTH / 2, 0]} receiveShadow>
        <boxGeometry args={[width - BASE_INSET * 2, BASE_DEPTH, depth - BASE_INSET * 2]} />
        <meshStandardMaterial color={colours.base} roughness={0.6} />
      </mesh>

      <Strips roads={pedestrianStreets} y={0.004} texture={surfaces.setts} tile={SETT_TILE} />
      <Strips roads={carriageways} y={0.01} texture={surfaces.blocks} tile={BLOCK_TILE} />
      {carriageways.map((road) => (
        <RoadDetails
          key={`${road.from.join()}-${road.to.join()}`}
          road={road}
          border={surfaces.border}
        />
      ))}
      {area.crossings.map((crossing) => (
        <ZebraCrossing key={crossing.position.join()} crossing={crossing} />
      ))}
    </group>
  );
}

/** Where and which way a segment lies, for placing flat strips along it. */
function frame(from: Vec2, to: Vec2) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return {
    length,
    angle: -Math.atan2(dz, dx),
    direction: [dx / length, dz / length] as Vec2,
    across: [-dz / length, dx / length] as Vec2,
  };
}

function nearCrossing(point: Vec2, distance: number) {
  return area.crossings.some(
    (c) => Math.hypot(c.position[0] - point[0], c.position[1] - point[1]) < distance
  );
}

/** Road segments as flat strips, with discs at the bends to fill the gaps between them. */
function Strips({
  roads,
  y,
  texture,
  tile,
}: {
  roads: Road[];
  y: number;
  texture: CanvasTexture;
  tile: number;
}) {
  const { segments, bends } = useMemo(() => {
    const segments = roads.map((road) => {
      const { length, angle } = frame(road.from, road.to);
      return { road, length, angle, map: tiled(texture, length, road.width, tile) };
    });
    const bends = roads.flatMap((road, i) => {
      const next = roads[i + 1];
      const joined = next && next.from[0] === road.to[0] && next.from[1] === road.to[1];
      return joined
        ? [
            {
              position: road.to,
              width: road.width,
              map: tiled(texture, road.width, road.width, tile),
            },
          ]
        : [];
    });
    return { segments, bends };
  }, [roads, texture, tile]);

  return (
    <group>
      {segments.map(({ road, length, angle, map }) => (
        <mesh
          key={`${road.from.join()}-${road.to.join()}`}
          position={[(road.from[0] + road.to[0]) / 2, y, (road.from[1] + road.to[1]) / 2]}
          rotation={[-Math.PI / 2, 0, angle]}
          receiveShadow
        >
          <planeGeometry args={[length, road.width]} />
          <meshStandardMaterial map={map} roughness={0.9} />
        </mesh>
      ))}
      {bends.map(({ position, width, map }) => (
        <mesh
          key={position.join()}
          position={[position[0], y, position[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <circleGeometry args={[width / 2, 24]} />
          <meshStandardMaterial map={map} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Granite kerbs, the terracotta edging inside them, and the dashed white lines marking out loading
 * bays along both sides.
 */
function RoadDetails({ road, border }: { road: Road; border: CanvasTexture }) {
  const { length, angle, direction, across } = frame(road.from, road.to);
  const middle: Vec2 = [(road.from[0] + road.to[0]) / 2, (road.from[1] + road.to[1]) / 2];
  const at = (along: number, side: number, y = 0): [number, number, number] => [
    middle[0] + direction[0] * along + across[0] * side,
    y,
    middle[1] + direction[1] * along + across[1] * side,
  ];
  const edging = useMemo(() => tiled(border, length, BORDER_WIDTH, BORDER_TILE), [border, length]);

  const dashes: number[] = [];
  for (let along = -length / 2 + BAY_DASH / 2; along < length / 2; along += BAY_DASH + BAY_GAP) {
    const [x, , z] = at(along, 0);
    if (!nearCrossing([x, z], CROSSING_LENGTH + 2)) dashes.push(along);
  }

  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={at(0, side * (road.width / 2 + KERB_WIDTH / 2))}
            rotation={[0, angle, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[length + 0.2, KERB_HEIGHT, KERB_WIDTH]} />
            <meshStandardMaterial color={colours.kerb} roughness={0.8} />
          </mesh>
          <mesh
            position={at(0, side * (road.width / 2 - BORDER_WIDTH / 2), 0.015)}
            rotation={[-Math.PI / 2, 0, angle]}
            receiveShadow
          >
            <planeGeometry args={[length, BORDER_WIDTH]} />
            <meshStandardMaterial map={edging} roughness={0.85} />
          </mesh>
          {dashes.map((along) => (
            <Line
              key={along}
              position={at(along, side * (road.width / 2 - BAY_WIDTH))}
              angle={angle}
              length={BAY_DASH}
              color={colours.roadMarking}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function Line({
  position,
  angle,
  length,
  color,
}: {
  position: [number, number, number];
  angle: number;
  length: number;
  color: string;
}) {
  return (
    <mesh
      position={[position[0], 0.02, position[2]]}
      rotation={[-Math.PI / 2, 0, angle]}
      receiveShadow
    >
      <planeGeometry args={[length, LINE_WIDTH]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

/** Stripes across the road, and a Belisha beacon on each kerb. */
function ZebraCrossing({ crossing }: { crossing: Crossing }) {
  const { position, direction, width } = crossing;
  const angle = -Math.atan2(direction[1], direction[0]);
  const stripes = Math.floor(width / (STRIPE_WIDTH * 2));
  const across: Vec2 = [-direction[1], direction[0]];
  const kerbOffset = width / 2 + KERB_WIDTH + 0.4;

  return (
    <group>
      <group position={[position[0], 0.025, position[1]]} rotation={[0, angle, 0]}>
        {Array.from({ length: stripes }, (_, i) => (
          <mesh
            key={i}
            position={[0, 0, (i - (stripes - 1) / 2) * STRIPE_WIDTH * 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[CROSSING_LENGTH, STRIPE_WIDTH]} />
            <meshStandardMaterial color={colours.roadMarking} roughness={0.6} />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((side) => (
        <BelishaBeacon
          key={side}
          position={[
            position[0] +
              across[0] * kerbOffset * side +
              direction[0] * (CROSSING_LENGTH / 2 + 0.3),
            position[1] +
              across[1] * kerbOffset * side +
              direction[1] * (CROSSING_LENGTH / 2 + 0.3),
          ]}
        />
      ))}
    </group>
  );
}

const POLE_HEIGHT = 2.6;
const POLE_BANDS = 6;

function BelishaBeacon({ position }: { position: Vec2 }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      {Array.from({ length: POLE_BANDS }, (_, i) => (
        <mesh key={i} position={[0, (i + 0.5) * (POLE_HEIGHT / POLE_BANDS), 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, POLE_HEIGHT / POLE_BANDS, 8]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? colours.poleDark : colours.poleLight}
            roughness={0.4}
          />
        </mesh>
      ))}
      <mesh position={[0, POLE_HEIGHT + 0.22, 0]} castShadow>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial
          color={colours.beacon}
          emissive={colours.beacon}
          emissiveIntensity={1.5}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

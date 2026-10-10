import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { type Group, MeshStandardMaterial } from 'three';
import type { Simulation } from '@/sim/simulation';
import type { VehicleKind } from '@/sim/traffic';
import { colours } from './palette';
import { StaticBatch } from './StaticBatch';

/** Paint for ordinary cars, so they don't all look alike. */
const PAINT = ['#b8bcc0', '#a8261f', '#2f4e7a', '#e8e6e0', '#3b3f45', '#5b6b4a'];
const BRAKE_ON = 2.4;
const BRAKE_OFF = 0.35;

/** The traffic on Long Acre, moved each frame to where the simulation has it. */
export function Traffic({ simulation }: { simulation: Simulation }) {
  const { vehicles } = simulation.traffic;
  const groups = useRef<(Group | null)[]>([]);
  const lastSpeed = useRef<number[]>(vehicles.map(() => 0));
  const brakes = useMemo(
    () =>
      vehicles.map(
        () =>
          new MeshStandardMaterial({
            color: '#8c1c16',
            emissive: '#ff2a1a',
            emissiveIntensity: BRAKE_OFF,
            toneMapped: false,
          })
      ),
    [vehicles]
  );

  useFrame(() => {
    vehicles.forEach((vehicle, i) => {
      const group = groups.current[i];
      if (!group) return;
      group.visible = vehicle.active;
      if (!vehicle.active) return;
      group.position.set(vehicle.position[0], 0, vehicle.position[1]);
      group.rotation.y = -vehicle.heading;
      // Brake lights on while slowing down or standing still.
      const slowing = vehicle.speed < lastSpeed.current[i]! - 0.01 || vehicle.speed < 0.5;
      brakes[i]!.emissiveIntensity = slowing ? BRAKE_ON : BRAKE_OFF;
      lastSpeed.current[i] = vehicle.speed;
    });
  });

  return (
    <group>
      {vehicles.map((vehicle, i) => (
        <group
          key={vehicle.slot}
          ref={(group) => {
            groups.current[i] = group;
          }}
          visible={false}
        >
          <StaticBatch>
            <VehicleModel kind={vehicle.kind} paint={PAINT[i % PAINT.length]!} brake={brakes[i]!} />
          </StaticBatch>
        </group>
      ))}
    </group>
  );
}

/** A vehicle at the origin, facing along +x, with its brake lights in `brake`. */
export function VehicleModel({
  kind,
  paint = PAINT[0]!,
  brake,
}: {
  kind: VehicleKind;
  paint?: string;
  brake?: MeshStandardMaterial;
}) {
  if (kind === 'cab') return <Cab brake={brake} />;
  if (kind === 'van') return <Van brake={brake} />;
  return <Car paint={paint} brake={brake} />;
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

/** A pair of rear lights at the back of a vehicle `length` long and `width` wide. */
function RearLights({
  length,
  width,
  height,
  material,
}: {
  length: number;
  width: number;
  height: number;
  material?: MeshStandardMaterial;
}) {
  if (!material) return null;
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[-length / 2 - 0.01, height, side * (width / 2 - 0.22)]}
          material={material}
        >
          <boxGeometry args={[0.05, 0.16, 0.3]} />
        </mesh>
      ))}
    </>
  );
}

/** A London black cab: rounded body, tall glasshouse and a yellow "TAXI" light. */
function Cab({ brake }: { brake?: MeshStandardMaterial }) {
  return (
    <group>
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
      <RearLights length={4.5} width={1.8} height={0.95} material={brake} />
      <Wheels length={4.5} width={1.8} />
    </group>
  );
}

/** A white delivery van: a tall box behind a short bonnet. */
function Van({ brake }: { brake?: MeshStandardMaterial }) {
  return (
    <group>
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
      <RearLights length={5} width={2} height={0.9} material={brake} />
      <Wheels length={5} width={2} />
    </group>
  );
}

/** An ordinary hatchback, in one of a few paints. */
function Car({ paint, brake }: { paint: string; brake?: MeshStandardMaterial }) {
  return (
    <group>
      <RoundedBox args={[4.2, 0.75, 1.75]} radius={0.22} position={[0, 0.72, 0]} castShadow>
        <meshStandardMaterial color={paint} roughness={0.25} metalness={0.35} />
      </RoundedBox>
      <RoundedBox args={[2.3, 0.6, 1.6]} radius={0.2} position={[-0.35, 1.32, 0]} castShadow>
        <meshStandardMaterial color={colours.glass} roughness={0.15} metalness={0.4} />
      </RoundedBox>
      <RoundedBox args={[2.1, 0.1, 1.62]} radius={0.04} position={[-0.4, 1.63, 0]} castShadow>
        <meshStandardMaterial color={paint} roughness={0.25} metalness={0.35} />
      </RoundedBox>
      <RearLights length={4.2} width={1.75} height={0.85} material={brake} />
      <Wheels length={4.2} width={1.75} />
    </group>
  );
}

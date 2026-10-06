import { useMemo } from 'react';
import { type CanvasTexture, DoubleSide, ExtrudeGeometry, MeshStandardMaterial } from 'three';
import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import { Boxes } from './Buildings';
import { extrude, shapeOf } from './extrude';
import { canvasTexture } from './facades';
import { insidePolygon, isBlocked } from './geometry';
import { colours } from './palette';
import { seeded } from './random';
import { rooftopClutter } from './rooftops';

/**
 * Covent Garden station, after Leslie Green's 1907 design: two storeys of ox-blood faience, with
 * an open ground floor of entrances and shops between piers, a cream fascia lettered with the
 * station's name, and big semicircular windows above, under a cornice. Four storeys of red brick
 * offices sit on top.
 */

/** Heights, in metres, of the parts of the frontage. */
const OPENING = 3.3;
const FASCIA_TOP = 4;
const FAIENCE_TOP = 8.4;
const CORNICE_TOP = 8.8;
const CORNICE = 0.35;
const TOP_CORNICE = 0.5;
/** How far back from the frontage the booking hall's walls are. */
const HALL_DEPTH = 2.6;
const PIER_WIDTH = 0.75;
const BAY_TARGET = 4.4;
/** Bays this close to a mapped entrance, in metres, are open, with ticket gates inside. */
const ENTRANCE_REACH = 4.5;

const station = area.buildings.find((b) => b.kind === 'train_station');
const entrances = area.places.filter((p) => p.kind === 'station').map((p) => p.position);

interface Frontage {
  /** Where the frontage starts, with outward to the left when looking from `from` to `to`. */
  from: Vec2;
  to: Vec2;
  length: number;
  bays: number;
  /** Which way the frontage faces: 'north' onto Long Acre, or 'east' onto James Street. */
  facing: 'north' | 'east' | 'other';
  /** Whether the frontage turns a street corner at its start and end. */
  corners: [boolean, boolean];
}

/** The station's street frontages: the walls with open pavement in front of them. */
function frontages(footprint: Vec2[]): Frontage[] {
  const faces = footprint.map((a, i) => {
    const b = footprint[(i + 1) % footprint.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let normal: Vec2 = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let [from, to] = [a, b];
    if (insidePolygon([middle[0] + normal[0], middle[1] + normal[1]], footprint)) {
      normal = [-normal[0], -normal[1]];
      [from, to] = [b, a];
    }
    const street = !isBlocked([middle[0] + normal[0] * 3, middle[1] + normal[1] * 3], 0.5);
    const facing: Frontage['facing'] =
      normal[1] < -0.7 ? 'north' : normal[0] > 0.7 ? 'east' : 'other';
    return { from, to, length, street, facing, normal, index: i };
  });
  // A corner is where the frontage turns onto another street, perhaps by way of a short
  // chamfer, not just a kink in a long wall.
  const cornerAt = (i: number, step: number) => {
    const face = faces[i]!;
    for (let j = i + step, hops = 0; hops < 3; j += step, hops++) {
      const other = faces[(j + faces.length) % faces.length]!;
      if (!other.street) return false;
      const turn = face.normal[0] * other.normal[0] + face.normal[1] * other.normal[1];
      if (turn < 0.9) return true;
      if (other.length > 5) return false;
    }
    return false;
  };
  return faces
    .filter((f) => f.street && f.length > 1.2)
    .map((f) => {
      // Which ends are corners depends on which way round the edge was flipped.
      const flipped = f.from !== footprint[f.index];
      const before = cornerAt(f.index, -1);
      const after = cornerAt(f.index, 1);
      return {
        from: f.from,
        to: f.to,
        length: f.length,
        bays: Math.max(1, Math.round(f.length / BAY_TARGET)),
        facing: f.facing,
        corners: flipped ? [after, before] : [before, after],
      };
    });
}

function at(frontage: Frontage, along: number): Vec2 {
  const t = along / frontage.length;
  return [
    frontage.from[0] + (frontage.to[0] - frontage.from[0]) * t,
    frontage.from[1] + (frontage.to[1] - frontage.from[1]) * t,
  ];
}

const LETTERING: Record<Frontage['facing'], string[]> = {
  north: ['COVENT', 'UNDERGROUND', 'GARDEN'],
  east: ['COVENT', 'GARDEN', 'STATION'],
  other: [''],
};

export function Station() {
  const parts = useMemo(() => {
    if (!station) return null;
    const footprint = station.footprint;
    const materials = {
      faience: new MeshStandardMaterial({
        color: colours.station,
        roughness: 0.22,
        metalness: 0.05,
      }),
      arches: new MeshStandardMaterial({ map: createArchTexture(), roughness: 0.25 }),
      brick: new MeshStandardMaterial({ map: createUpperTexture(), roughness: 0.75 }),
      stone: new MeshStandardMaterial({ color: '#efe9dc', roughness: 0.6 }),
      roof: new MeshStandardMaterial({ color: '#8a9199', roughness: 0.8 }),
      hall: new MeshStandardMaterial({
        color: '#efe3c8',
        emissive: '#ffd9a0',
        emissiveIntensity: 0.45,
        roughness: 0.5,
      }),
      glass: new MeshStandardMaterial({ color: '#3a4a5a', roughness: 0.15, metalness: 0.3 }),
      awning: new MeshStandardMaterial({ color: '#1f4a3a', roughness: 0.7, side: DoubleSide }),
      gate: new MeshStandardMaterial({ color: '#4d545c', roughness: 0.4, metalness: 0.4 }),
      reader: new MeshStandardMaterial({ color: colours.yellowLine, roughness: 0.4 }),
      paddle: new MeshStandardMaterial({ color: '#d63b2f', roughness: 0.35 }),
      step: new MeshStandardMaterial({ color: colours.yellowLine, roughness: 0.6 }),
      bracket: new MeshStandardMaterial({ color: colours.poleDark, roughness: 0.4 }),
    };
    const upperTop = station.height - TOP_CORNICE;
    return {
      footprint,
      materials,
      geometry: {
        hall: insetGeometry(footprint, HALL_DEPTH, OPENING),
        faience: extrude(footprint, { height: FAIENCE_TOP, bevel: 0, base: OPENING }),
        cornice: extrude(footprint, { height: CORNICE_TOP, bevel: CORNICE, base: FAIENCE_TOP }),
        upper: extrude(footprint, { height: upperTop, bevel: 0, base: CORNICE_TOP }),
        topCornice: extrude(footprint, {
          height: station.height,
          bevel: TOP_CORNICE * 0.6,
          base: upperTop,
        }),
      },
      // Each frontage repeats the arched bay a whole number of times across its width.
      frontages: frontages(footprint).map((frontage) => {
        const arches = materials.arches.clone();
        arches.map = materials.arches.map!.clone();
        arches.map.repeat.set(frontage.bays, 1);
        return { ...frontage, arches };
      }),
      rooftop: rooftopClutter(station, seeded(station.id)),
      signs: new Map<string, CanvasTexture>(),
    };
  }, []);

  if (!parts) return null;
  const { materials, geometry } = parts;
  const sign = (text: string) => {
    if (!parts.signs.has(text)) parts.signs.set(text, createSignTexture(text));
    return parts.signs.get(text)!;
  };

  return (
    <group>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={geometry.hall} material={materials.hall} receiveShadow />
        <mesh
          geometry={geometry.faience}
          material={[materials.faience, materials.faience]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={geometry.cornice}
          material={[materials.faience, materials.faience]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={geometry.upper}
          material={[materials.roof, materials.brick]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={geometry.topCornice}
          material={[materials.roof, materials.stone]}
          castShadow
          receiveShadow
        />
      </group>

      <Boxes boxes={parts.rooftop} />

      {parts.frontages.map((frontage) => {
        const bay = frontage.length / frontage.bays;
        const angle = -Math.atan2(
          frontage.to[1] - frontage.from[1],
          frontage.to[0] - frontage.from[0]
        );
        const lettering = LETTERING[frontage.facing];

        return (
          <group
            key={frontage.from.join()}
            position={[frontage.from[0], 0, frontage.from[1]]}
            // Local x runs along the frontage, local z points out into the street.
            rotation={[0, angle, 0]}
          >
            <mesh
              position={[frontage.length / 2, (OPENING + FAIENCE_TOP) / 2, 0.03]}
              material={frontage.arches}
              receiveShadow
            >
              <planeGeometry args={[frontage.length, FAIENCE_TOP - OPENING]} />
            </mesh>

            {Array.from({ length: frontage.bays + 1 }, (_, k) => (
              <mesh
                key={`pier ${k}`}
                position={[
                  Math.min(Math.max(k * bay, PIER_WIDTH / 2), frontage.length - PIER_WIDTH / 2),
                  OPENING / 2,
                  -0.25,
                ]}
                material={materials.faience}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[PIER_WIDTH, OPENING, 0.6]} />
              </mesh>
            ))}

            {Array.from({ length: frontage.bays }, (_, i) => {
              const centre = (i + 0.5) * bay;
              const middle = at(frontage, centre);
              const open =
                bay > 2.4 &&
                entrances.some(
                  (e) => Math.hypot(e[0] - middle[0], e[1] - middle[1]) < ENTRANCE_REACH
                );
              const width = bay - PIER_WIDTH;
              const text =
                frontage.bays === 1 && bay > 2.4 ? 'UNDERGROUND' : lettering[i % lettering.length]!;
              return (
                <group key={`bay ${i}`} position={[centre, 0, 0]}>
                  {open ? (
                    <TicketGates width={width} materials={materials} />
                  ) : (
                    <>
                      <mesh position={[0, OPENING / 2 + 0.2, -0.2]} material={materials.glass}>
                        <boxGeometry args={[width, OPENING - 0.4, 0.1]} />
                      </mesh>
                      <mesh position={[0, 0.2, -0.15]} material={materials.faience}>
                        <boxGeometry args={[width, 0.4, 0.2]} />
                      </mesh>
                    </>
                  )}
                  {/* A canvas awning over the opening, sloping down into the street. */}
                  <group position={[0, OPENING - 0.05, 0]} rotation={[0.35, 0, 0]}>
                    <mesh position={[0, 0, 0.48]} material={materials.awning} castShadow>
                      <boxGeometry args={[width - 0.1, 0.06, 0.95]} />
                    </mesh>
                  </group>
                  {text && bay > 2.4 && (
                    <mesh position={[0, (OPENING + FASCIA_TOP) / 2, 0.06]}>
                      <planeGeometry args={[Math.min(width, 3.6), (FASCIA_TOP - OPENING) * 0.8]} />
                      <meshStandardMaterial map={sign(text)} roughness={0.4} />
                    </mesh>
                  )}
                </group>
              );
            })}

            {/* Roundels on brackets, sticking out from the piers at the street corners. */}
            {frontage.length > 6 &&
              frontage.corners.map((corner, end) =>
                corner ? (
                  <ProjectingRoundel
                    key={`roundel ${end}`}
                    along={end === 0 ? 0.6 : frontage.length - 0.6}
                    bracket={materials.bracket}
                  />
                ) : null
              )}
          </group>
        );
      })}
    </group>
  );
}

/** A line of ticket gates, set back inside an open bay, in front of the lit booking hall. */
function TicketGates({
  width,
  materials,
}: {
  width: number;
  materials: Record<'gate' | 'reader' | 'paddle' | 'step', MeshStandardMaterial>;
}) {
  const count = Math.max(2, Math.floor(width / 0.75) + 1);
  const spacing = (width - 0.3) / (count - 1);
  return (
    <group>
      {/* The yellow nosing on the step up into the station. */}
      <mesh position={[0, 0.02, -0.15]} material={materials.step}>
        <boxGeometry args={[width, 0.04, 0.2]} />
      </mesh>
      <group position={[0, 0, -1.5]}>
        {Array.from({ length: count }, (_, i) => {
          const x = -width / 2 + 0.15 + i * spacing;
          return (
            <group key={i} position={[x, 0, 0]}>
              <mesh position={[0, 0.5, 0]} material={materials.gate} castShadow>
                <boxGeometry args={[0.2, 1, 1.1]} />
              </mesh>
              <mesh position={[0, 1.03, 0.35]} material={materials.reader}>
                <boxGeometry args={[0.22, 0.06, 0.3]} />
              </mesh>
              {i < count - 1 && (
                <mesh position={[spacing / 2, 0.7, 0]} material={materials.paddle}>
                  <boxGeometry args={[spacing - 0.24, 0.4, 0.05]} />
                </mesh>
              )}
            </group>
          );
        })}
      </group>
    </group>
  );
}

const ROUNDEL_RADIUS = 0.75;

/** An Underground roundel hung on a bracket, facing along the street. */
function ProjectingRoundel({ along, bracket }: { along: number; bracket: MeshStandardMaterial }) {
  const height = 5.6;
  const out = 1.15;
  return (
    <group position={[along, height, 0]}>
      <mesh position={[0, ROUNDEL_RADIUS + 0.05, out / 2]} material={bracket}>
        <boxGeometry args={[0.06, 0.06, out]} />
      </mesh>
      <group position={[0, 0, out]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <circleGeometry args={[ROUNDEL_RADIUS * 0.62, 32]} />
          <meshStandardMaterial color="#ffffff" side={DoubleSide} />
        </mesh>
        <mesh>
          <ringGeometry args={[ROUNDEL_RADIUS * 0.62, ROUNDEL_RADIUS, 40]} />
          <meshStandardMaterial color={colours.roundelRed} side={DoubleSide} />
        </mesh>
        <mesh>
          <boxGeometry args={[ROUNDEL_RADIUS * 2.5, ROUNDEL_RADIUS * 0.42, 0.08]} />
          <meshStandardMaterial color={colours.roundelBlue} />
        </mesh>
      </group>
    </group>
  );
}

/** The footprint shrunk by `inset` metres and extruded up to `height`, for the booking hall. */
function insetGeometry(footprint: Vec2[], inset: number, height: number): ExtrudeGeometry {
  // Pulling the bevel in moves the walls inwards; a hair of bevel keeps three from ignoring it.
  return new ExtrudeGeometry(shapeOf(footprint), {
    depth: height - 0.002,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.001,
    bevelOffset: -inset,
    bevelSegments: 1,
  });
}

/**
 * One bay of the arched storey: a cream fascia band along the bottom, then a big semicircular
 * window with white glazing bars fanning out, set in a moulded ox-blood surround.
 */
function createArchTexture(): CanvasTexture {
  const fasciaShare = (FASCIA_TOP - OPENING) / (FAIENCE_TOP - OPENING);
  const texture = canvasTexture(
    (context, size) => {
      context.fillStyle = colours.station;
      context.fillRect(0, 0, size, size);
      // Glazed tiles catch the light in faint courses.
      context.fillStyle = 'rgba(255, 255, 255, 0.05)';
      for (let y = 0; y < size; y += 6) context.fillRect(0, y, size, 1);
      // The fascia.
      const fasciaTop = size * (1 - fasciaShare);
      context.fillStyle = '#efe8d6';
      context.fillRect(0, fasciaTop, size, size - fasciaTop);
      context.fillStyle = '#6e1f1a';
      context.fillRect(0, fasciaTop - 3, size, 3);

      // The arch: a moulding, then the window, then its glazing bars.
      const left = size * 0.16;
      const right = size * 0.84;
      const radius = (right - left) / 2;
      const springing = size * 0.5;
      const bottom = fasciaTop - size * 0.06;
      const archPath = (grow: number) => {
        context.beginPath();
        context.moveTo(left - grow, bottom);
        context.lineTo(left - grow, springing);
        context.arc(left + radius, springing, radius + grow, Math.PI, 0);
        context.lineTo(right + grow, bottom);
        context.closePath();
      };
      context.fillStyle = '#a63a31';
      archPath(5);
      context.fill();
      const glass = context.createLinearGradient(0, springing - radius, 0, bottom);
      glass.addColorStop(0, colours.windowSky);
      glass.addColorStop(0.5, colours.window);
      glass.addColorStop(1, '#384656');
      context.fillStyle = glass;
      archPath(0);
      context.fill();
      context.strokeStyle = '#f4f1ea';
      context.lineWidth = 2.5;
      archPath(0);
      context.stroke();
      context.lineWidth = 2;
      for (const t of [0.2, 0.4, 0.6, 0.8]) {
        const a = Math.PI + t * Math.PI;
        context.beginPath();
        context.moveTo(left + radius, springing);
        context.lineTo(left + radius + Math.cos(a) * radius, springing + Math.sin(a) * radius);
        context.stroke();
      }
      context.beginPath();
      context.moveTo(left, springing);
      context.lineTo(right, springing);
      context.stroke();
      for (const t of [0.25, 0.5, 0.75]) {
        context.beginPath();
        context.moveTo(left + (right - left) * t, springing);
        context.lineTo(left + (right - left) * t, bottom);
        context.stroke();
      }
    },
    [1, FAIENCE_TOP - OPENING]
  );
  // Plane UVs run 0–1 the right way up, so undo the flip that wall UVs need.
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  return texture;
}

/** The red brick offices above: white windows, each with a blue-grey panel over it. */
function createUpperTexture(): CanvasTexture {
  const storey = 3.25;
  return canvasTexture(
    (context, size) => {
      context.fillStyle = '#a24d39';
      context.fillRect(0, 0, size, size);
      context.fillStyle = 'rgba(255, 255, 255, 0.07)';
      for (let y = 1; y < size; y += 3) context.fillRect(0, y, size, 1);
      // A stone band at each floor.
      context.fillStyle = '#ece6da';
      context.fillRect(0, size - 5, size, 5);
      for (const x of [0.1, 0.55]) {
        const left = size * x;
        const width = size * 0.35;
        context.fillStyle = '#4f6a8a';
        context.fillRect(left, size * 0.1, width, size * 0.12);
        context.fillStyle = '#9fb3c9';
        for (let i = 0; i < 4; i++) {
          context.fillRect(left + 3 + i * (width / 4), size * 0.13, 4, size * 0.06);
        }
        context.fillStyle = '#f4f1ea';
        context.fillRect(left, size * 0.25, width, size * 0.55);
        const glass = context.createLinearGradient(0, size * 0.27, 0, size * 0.78);
        glass.addColorStop(0, colours.windowSky);
        glass.addColorStop(0.4, colours.window);
        glass.addColorStop(1, '#3e4c5b');
        context.fillStyle = glass;
        context.fillRect(left + 3, size * 0.27, width - 6, size * 0.51);
        context.fillStyle = '#f4f1ea';
        context.fillRect(left + width / 2 - 1, size * 0.27, 2, size * 0.51);
        context.fillRect(left + 3, size * 0.5, width - 6, 2);
      }
    },
    [3.4, storey]
  );
}

/** Lettering for the fascia: black serif capitals on cream, or white on blue for UNDERGROUND. */
function createSignTexture(text: string): CanvasTexture {
  const blue = text === 'UNDERGROUND';
  const texture = canvasTexture(
    (context, size) => {
      context.fillStyle = blue ? '#2c4e9c' : '#efe8d6';
      context.fillRect(0, 0, size, size);
      context.fillStyle = blue ? '#ffffff' : '#1d1d1f';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      // The canvas is square but the sign is long and thin, so draw tall letters that the
      // stretch across the sign squashes back into shape.
      context.save();
      context.scale(1, 5);
      context.font = `600 ${blue ? 14 : 19}px Georgia, 'Times New Roman', serif`;
      context.fillText(text, size / 2, size / 10 + 1, size * 0.92);
      context.restore();
    },
    [1, 1]
  );
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  return texture;
}

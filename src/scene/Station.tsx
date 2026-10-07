import { useMemo } from 'react';
import { type CanvasTexture, DoubleSide, type ExtrudeGeometry, MeshStandardMaterial } from 'three';
import { area } from '@/data/area';
import {
  type BookingHall,
  EXIT_GATES,
  type Frontage,
  HALL_GATES,
  PIER_WIDTH,
  VESTIBULE_DEPTH,
  stationLayout,
} from '@/data/station';
import type { Vec2 } from '@/sim/network';
import { Boxes } from './Buildings';
import { extrude } from './extrude';
import { canvasTexture } from './facades';
import { LAYERS, layer } from './flat';
import { clipHalfPlane } from './geometry';
import { colours } from './palette';
import { seeded } from './random';
import { rooftopClutter } from './rooftops';

/**
 * Covent Garden station, after Leslie Green's 1907 design: two storeys of ox-blood faience, with
 * an open ground floor of entrances and shops between piers, a cream fascia lettered with the
 * station's name, and big semicircular windows above, under a cornice. Four storeys of red brick
 * offices sit on top. Off Long Acre, two open bays lead into the booking hall, with the ticket
 * gates across the back of one side; on James Street, exit gates stand just inside the doors.
 */

/** Heights, in metres, of the parts of the frontage. */
const OPENING = 3.3;
const FASCIA_TOP = 4;
const FAIENCE_TOP = 8.4;
const CORNICE_TOP = 8.8;
const CORNICE = 0.35;
const TOP_CORNICE = 0.5;

const station = area.buildings.find((b) => b.kind === 'train_station');

const LETTERING: Record<Frontage['facing'], string[]> = {
  north: ['COVENT', 'UNDERGROUND', 'GARDEN'],
  east: ['COVENT', 'GARDEN', 'STATION'],
  other: [''],
};

/**
 * The solid ground floor behind the open frontages: the footprint, cut back from every street
 * frontage by the depth of the vestibules, with the booking hall carved out of it. The carving is
 * done as overlapping pieces, behind the hall and either side of it, which together cover all but
 * the hall.
 */
function groundFloor(footprint: Vec2[], frontages: Frontage[], hall: BookingHall | null): Vec2[][] {
  let core = footprint;
  for (const f of frontages) {
    const offset = f.normal[0] * f.from[0] + f.normal[1] * f.from[1] - VESTIBULE_DEPTH;
    core = clipHalfPlane(core, f.normal, offset);
  }
  if (!hall) return [core];
  const f = frontages[hall.frontage]!;
  const facing = f.normal[0] * f.from[0] + f.normal[1] * f.from[1];
  const along = f.along[0] * f.from[0] + f.along[1] * f.from[1];
  return [
    clipHalfPlane(core, f.normal, facing - hall.depth),
    clipHalfPlane(core, f.along, along + hall.start),
    clipHalfPlane(core, [-f.along[0], -f.along[1]], -(along + hall.end)),
  ].filter((piece) => piece.length >= 3);
}

export function Station() {
  const parts = useMemo(() => {
    if (!station || !stationLayout) return null;
    const { footprint, frontages, hall } = stationLayout;
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
        color: '#e4d9c2',
        emissive: '#ffd9a0',
        emissiveIntensity: 0.2,
        roughness: 0.5,
      }),
      ceiling: new MeshStandardMaterial({
        color: '#f3eee2',
        emissive: '#fff2d8',
        emissiveIntensity: 0.3,
        side: DoubleSide,
      }),
      floor: new MeshStandardMaterial({ color: '#9f9a90', roughness: 0.45, ...layer(LAYERS.road) }),
      glass: new MeshStandardMaterial({ color: '#3a4a5a', roughness: 0.15, metalness: 0.3 }),
      // Photos show slatted grey metal canopies over the openings.
      awning: new MeshStandardMaterial({
        color: '#7f8b94',
        roughness: 0.5,
        metalness: 0.3,
        side: DoubleSide,
      }),
      gate: new MeshStandardMaterial({ color: '#4d545c', roughness: 0.4, metalness: 0.4 }),
      reader: new MeshStandardMaterial({ color: colours.yellowLine, roughness: 0.4 }),
      paddle: new MeshStandardMaterial({ color: '#d63b2f', roughness: 0.35 }),
      step: new MeshStandardMaterial({ color: colours.yellowLine, roughness: 0.6 }),
      bracket: new MeshStandardMaterial({ color: colours.poleDark, roughness: 0.4 }),
      passage: new MeshStandardMaterial({ color: '#2b2622', roughness: 0.9 }),
      machine: new MeshStandardMaterial({ color: '#2450a8', roughness: 0.35 }),
      screen: new MeshStandardMaterial({
        color: '#9fd0ff',
        emissive: '#9fd0ff',
        emissiveIntensity: 0.6,
      }),
      map: new MeshStandardMaterial({ map: createMapTexture(), roughness: 0.5 }),
      poster: new MeshStandardMaterial({ map: createPosterTexture(), roughness: 0.3 }),
    };
    const upperTop = station.height - TOP_CORNICE;
    return {
      materials,
      geometry: {
        ground: groundFloor(footprint, frontages, hall).map((piece) =>
          extrude(piece, { height: OPENING, bevel: 0 })
        ),
        faience: extrude(footprint, { height: FAIENCE_TOP, bevel: 0, base: OPENING }),
        cornice: extrude(footprint, { height: CORNICE_TOP, bevel: CORNICE, base: FAIENCE_TOP }),
        upper: extrude(footprint, { height: upperTop, bevel: 0, base: CORNICE_TOP }),
        topCornice: extrude(footprint, {
          height: station.height,
          bevel: TOP_CORNICE * 0.6,
          base: upperTop,
        }),
      },
      hall,
      // Each frontage repeats the arched bay a whole number of times across its width.
      frontages: frontages.map((frontage) => {
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
        {geometry.ground.map((piece, i) => (
          <mesh key={i} geometry={piece} material={materials.hall} receiveShadow />
        ))}
        <Solid geometry={geometry.faience} material={materials.faience} />
        <Solid geometry={geometry.cornice} material={materials.faience} />
        <Solid geometry={geometry.upper} material={[materials.roof, materials.brick]} />
        <Solid geometry={geometry.topCornice} material={[materials.roof, materials.stone]} />
      </group>

      <Boxes boxes={parts.rooftop} />

      {parts.frontages.map((frontage, index) => {
        const bay = frontage.length / frontage.bays;
        const angle = -Math.atan2(frontage.along[1], frontage.along[0]);
        const lettering = LETTERING[frontage.facing];
        const hall = parts.hall?.frontage === index ? parts.hall : null;

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

            {hall && <HallInterior hall={hall} materials={materials} />}

            {frontage.uses.map((use, i) => {
              const centre = (i + 0.5) * bay;
              const width = bay - PIER_WIDTH;
              const wide = bay > 2.4;
              // The short faces at the corner carry the blue COVENT GARDEN signs, and the one
              // that isn't a doorway is solid, with a big poster on it.
              const atCorner = frontage.bays === 1 && frontage.corners.some(Boolean);
              const text = atCorner ? 'COVENT GARDEN' : lettering[i % lettering.length]!;
              const poster = atCorner && use === 'shop';
              return (
                <group key={`bay ${i}`} position={[centre, 0, 0]}>
                  {use === 'exit' && (
                    <>
                      <Step width={width} material={materials.step} />
                      <group position={[0, 0, -EXIT_GATES]}>
                        <GateLine width={width} materials={materials} />
                      </group>
                    </>
                  )}
                  {use === 'hall' && <Step width={width} material={materials.step} />}
                  {use === 'shop' && !poster && (
                    <>
                      <mesh position={[0, OPENING / 2 + 0.2, -0.2]} material={materials.glass}>
                        <boxGeometry args={[width, OPENING - 0.4, 0.1]} />
                      </mesh>
                      <mesh position={[0, 0.2, -0.15]} material={materials.faience}>
                        <boxGeometry args={[width, 0.4, 0.2]} />
                      </mesh>
                    </>
                  )}
                  {poster && (
                    // The corner is solid faience, with a big poster in a frame.
                    <>
                      <mesh position={[0, OPENING / 2, -0.1]} material={materials.faience}>
                        <boxGeometry args={[width + 0.02, OPENING, 0.4]} />
                      </mesh>
                      {wide && (
                        <mesh position={[0, OPENING / 2 + 0.1, 0.11]} material={materials.poster}>
                          <planeGeometry args={[Math.min(width - 0.4, 1.6), 2.6]} />
                        </mesh>
                      )}
                    </>
                  )}
                  {use !== 'shop' && wide && (
                    // A slatted metal canopy over the opening, sloping down into the street.
                    <group position={[0, OPENING - 0.05, 0]} rotation={[0.3, 0, 0]}>
                      <mesh position={[0, 0, 0.55]} material={materials.awning} castShadow>
                        <boxGeometry args={[width - 0.1, 0.05, 1.1]} />
                      </mesh>
                    </group>
                  )}
                  {text && wide && (
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

function Solid({
  geometry,
  material,
}: {
  geometry: ExtrudeGeometry;
  material: MeshStandardMaterial | MeshStandardMaterial[];
}) {
  const materials = Array.isArray(material) ? material : [material, material];
  return <mesh geometry={geometry} material={materials} castShadow receiveShadow />;
}

type Materials = Record<
  | 'gate'
  | 'reader'
  | 'paddle'
  | 'step'
  | 'ceiling'
  | 'floor'
  | 'passage'
  | 'machine'
  | 'screen'
  | 'map',
  MeshStandardMaterial
>;

/** The yellow nosing on the step up into the station. */
function Step({ width, material }: { width: number; material: MeshStandardMaterial }) {
  return (
    <mesh position={[0, 0.02, -0.15]} material={material}>
      <boxGeometry args={[width, 0.04, 0.2]} />
    </mesh>
  );
}

/**
 * The booking hall, in the frontage's own coordinates: a lit ceiling and floor, ticket machines
 * and maps against the back wall on the corner side, and the line of gates across the back of the
 * other side, in front of the dark passage down to the lifts.
 */
function HallInterior({ hall, materials }: { hall: BookingHall; materials: Materials }) {
  const width = hall.end - hall.start;
  const middle = (hall.start + hall.end) / 2;
  const gatesWidth = hall.gates[1] - hall.gates[0];
  const gatesMiddle = (hall.gates[0] + hall.gates[1]) / 2;
  // The machines go on whichever side of the hall the gates aren't.
  const gatesFirst = gatesMiddle < middle;
  const machinesFrom = gatesFirst ? hall.gates[1] + 0.8 : hall.start + 0.6;
  const back = -hall.depth;
  return (
    <group>
      <mesh
        position={[middle, 0, -hall.depth / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.floor}
        receiveShadow
      >
        <planeGeometry args={[width, hall.depth]} />
      </mesh>
      <mesh
        position={[middle, OPENING - 0.02, -hall.depth / 2 - 0.3]}
        rotation={[Math.PI / 2, 0, 0]}
        material={materials.ceiling}
      >
        <planeGeometry args={[width, hall.depth - 0.6]} />
      </mesh>
      <group position={[gatesMiddle, 0, -(hall.depth - HALL_GATES)]}>
        <GateLine width={gatesWidth} materials={materials} />
      </group>
      <mesh position={[gatesMiddle, 1.3, back + 0.01]} material={materials.passage}>
        <planeGeometry args={[gatesWidth - 0.4, 2.6]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <group key={i} position={[machinesFrom + 0.45 + i * 0.95, 0, back + 0.3]}>
          <mesh position={[0, 0.85, 0]} material={materials.machine} castShadow>
            <boxGeometry args={[0.75, 1.7, 0.5]} />
          </mesh>
          <mesh position={[0, 1.15, 0.26]} material={materials.screen}>
            <planeGeometry args={[0.45, 0.35]} />
          </mesh>
        </group>
      ))}
      <mesh position={[machinesFrom + 1.4, 2.45, back + 0.02]} material={materials.map}>
        <planeGeometry args={[2.6, 0.9]} />
      </mesh>
    </group>
  );
}

/** A line of ticket gates across `width` metres, centred on the origin, facing the street. */
function GateLine({ width, materials }: { width: number; materials: Materials }) {
  const count = Math.max(2, Math.floor(width / 0.75) + 1);
  const spacing = (width - 0.3) / (count - 1);
  return (
    <group>
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

/**
 * Lettering for the fascia: black serif capitals on cream, or white on navy for the UNDERGROUND
 * panels and the COVENT GARDEN signs at the corner, which are in sans-serif capitals.
 */
function createSignTexture(text: string): CanvasTexture {
  const blue = text === 'UNDERGROUND' || text === 'COVENT GARDEN';
  const sans = text === 'COVENT GARDEN';
  const texture = canvasTexture(
    (context, size) => {
      context.fillStyle = blue ? '#24357e' : '#efe8d6';
      context.fillRect(0, 0, size, size);
      context.fillStyle = blue ? '#ffffff' : '#1d1d1f';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      // The canvas is square but the sign is long and thin, so draw tall letters that the
      // stretch across the sign squashes back into shape.
      context.save();
      context.scale(1, 5);
      context.font = sans
        ? `600 13px system-ui, 'Helvetica Neue', Arial, sans-serif`
        : `600 ${blue ? 14 : 19}px Georgia, 'Times New Roman', serif`;
      context.fillText(text, size / 2, size / 10 + 1, size * 0.92);
      context.restore();
    },
    [1, 1]
  );
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  return texture;
}

/** A Tube map on the booking hall wall: coloured lines criss-crossing a white board. */
function createMapTexture(): CanvasTexture {
  const texture = canvasTexture(
    (context, size) => {
      context.fillStyle = '#f7f6f2';
      context.fillRect(0, 0, size, size);
      const lines = ['#dc241f', '#0019a8', '#00782a', '#ffd329', '#a0a5a9', '#9b0056', '#000000'];
      context.lineWidth = 3;
      lines.forEach((colour, i) => {
        context.strokeStyle = colour;
        context.beginPath();
        context.moveTo(0, 12 + i * 15);
        context.lineTo(size * 0.35, 12 + i * 15);
        context.lineTo(size * 0.55, size - 12 - i * 14);
        context.lineTo(size, size - 12 - i * 14);
        context.stroke();
      });
      context.strokeStyle = '#1b2a6b';
      context.lineWidth = 4;
      context.strokeRect(2, 2, size - 4, size - 4);
    },
    [1, 1]
  );
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  return texture;
}

/**
 * A big theatre poster on the station's corner, as photos show there: a pale, wintry picture of a
 * figure with arms spread, over a block of title lettering.
 */
function createPosterTexture(): CanvasTexture {
  const texture = canvasTexture(
    (context, size) => {
      const sky = context.createLinearGradient(0, 0, 0, size);
      sky.addColorStop(0, '#dcebf7');
      sky.addColorStop(0.6, '#a9c9e6');
      sky.addColorStop(1, '#eef4fa');
      context.fillStyle = sky;
      context.fillRect(0, 0, size, size);
      // Snowflakes.
      context.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (let i = 0; i < 40; i++) {
        context.fillRect((i * 37) % size, (i * 53) % (size * 0.6), 2, 2);
      }
      // The figure: a head, a long gown and outstretched arms.
      context.fillStyle = '#f2dccb';
      context.beginPath();
      context.arc(size * 0.5, size * 0.2, size * 0.055, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8d38f';
      context.fillRect(size * 0.45, size * 0.14, size * 0.1, size * 0.04);
      context.fillStyle = '#7fb3e0';
      context.beginPath();
      context.moveTo(size * 0.5, size * 0.26);
      context.lineTo(size * 0.32, size * 0.66);
      context.lineTo(size * 0.68, size * 0.66);
      context.closePath();
      context.fill();
      context.strokeStyle = '#f2dccb';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(size * 0.2, size * 0.2);
      context.lineTo(size * 0.5, size * 0.3);
      context.lineTo(size * 0.8, size * 0.22);
      context.stroke();
      // The title block.
      context.fillStyle = '#1d3a78';
      context.fillRect(size * 0.15, size * 0.76, size * 0.7, size * 0.07);
      context.fillStyle = '#5d6f92';
      context.fillRect(size * 0.25, size * 0.86, size * 0.5, size * 0.025);
      context.fillRect(size * 0.3, size * 0.9, size * 0.4, size * 0.02);
    },
    [1, 1]
  );
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  return texture;
}

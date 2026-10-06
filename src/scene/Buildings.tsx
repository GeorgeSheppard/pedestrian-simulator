import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  type CanvasTexture,
  Color,
  ExtrudeGeometry,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Building } from '@/data/area';
import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import { extrude, shapeOf } from './extrude';
import { canvasTexture, facadeFor, facadeTexture, trimColour, wallColour } from './facades';
import type { FacadeStyle } from './facades';
import { convexity, insidePolygon, polygonArea } from './geometry';
import { pick, seeded } from './random';
import { rooftopClutter } from './rooftops';
import { colours, fascias, roofs } from './palette';

const CORNICE = 0.15;
const SHOPFRONT_HEIGHT = 3.6;
const SHOPFRONT_BAY = 4;
/** How far shopfronts stand proud of the walls above them. */
const SHOPFRONT_DEPTH = 0.35;
const MANSARD_HEIGHT = 2.6;
const MANSARD_INSET = 1;
/** Buildings smaller than this, in square metres, get flat roofs: a mansard would fold in on itself. */
const MANSARD_MIN_AREA = 80;
const PARAPET_HEIGHT = 0.8;
const PARAPET_THICKNESS = 0.3;
const COPING = 0.12;

interface BuildingMesh {
  body: ExtrudeGeometry;
  bodyMaterials: MeshStandardMaterial[];
  shopfront: ExtrudeGeometry;
  shopfrontMaterials: MeshStandardMaterial[];
  mansard?: ExtrudeGeometry;
}

export interface Box {
  position: [number, number, number];
  size: [number, number, number];
  /** Rotation about y, in radians. */
  rotation?: number;
  colour: string;
}

/** Shopfronts that photos show for the landmarks: a painted fascia between pilasters. */
const LANDMARK_SHOPFRONTS: Record<string, { fascia: string; pilaster: string }> = {
  Boots: { fascia: colours.boots, pilaster: '#e3dccd' },
  'Regal House': { fascia: '#1c1d1f', pilaster: '#2b2c2f' },
  'Russell & Bromley': { fascia: '#f2efe8', pilaster: '#e3dccd' },
  'Odhams Walk': { fascia: '#2b2a2a', pilaster: '#6a4536' },
};

/** Planters and shrubs, for roof terraces. */
const planters = ['#5f7f3d', '#6f8f45', '#4f6b35', '#7d6a55'];

/** Every building but the station, which is modelled on its own in Station.tsx. */
const buildings = area.buildings.filter((b) => b.kind !== 'train_station');

export function Buildings() {
  const { meshes, mansardMaterials, boxes } = useMemo(() => {
    const roofMaterials = roofs.map((color) => new MeshStandardMaterial({ color, roughness: 0.8 }));
    const mansardMaterials = [
      new MeshStandardMaterial({ color: colours.slate, roughness: 0.6 }),
      new MeshStandardMaterial({ map: createDormerTexture(), roughness: 0.55 }),
    ];
    const facadeTextures = new Map<string, CanvasTexture>();
    const shopfronts = new Map<string, MeshStandardMaterial>();

    const boxes: Box[] = [];
    const meshes = buildings.map((building): BuildingMesh => {
      const random = seeded(building.id);
      const facade = facadeFor(building, random);
      const landmark = building.name ? LANDMARK_SHOPFRONTS[building.name] : undefined;
      // Mansards are pulled in from the walls, which folds them in on themselves on small or
      // notched footprints, so those get flat roofs. So do the landmarks, as in photos of them.
      const mansard =
        !landmark &&
        polygonArea(building.footprint) > MANSARD_MIN_AREA &&
        convexity(building.footprint) > 0.94 &&
        random() < 0.5;
      const wallHeight = mansard ? building.height - MANSARD_HEIGHT : building.height;
      // Fit a whole number of storeys to the walls, so no row of windows is cut off at the top.
      // A mansard holds the top storey.
      const storeys = building.levels ?? Math.max(1, Math.round(building.height / 3.6));
      const storey =
        Math.round((wallHeight / Math.max(1, mansard ? storeys - 1 : storeys)) * 100) / 100;

      const textureKey = `${facade.style} ${storey}`;
      if (!facadeTextures.has(textureKey)) {
        facadeTextures.set(textureKey, facadeTexture(facade.style, storey));
      }
      const walls = new MeshStandardMaterial({
        map: facadeTextures.get(textureKey),
        roughness: facade.style === 'stucco' ? 0.5 : 0.75,
      });

      const fascia = landmark?.fascia ?? pick(fascias, random());
      const pilaster = landmark?.pilaster ?? fascia;
      const shopfrontKey = `${fascia} ${pilaster}`;
      if (!shopfronts.has(shopfrontKey)) {
        shopfronts.set(
          shopfrontKey,
          new MeshStandardMaterial({
            map: createShopfrontTexture(fascia, pilaster),
            roughness: 0.4,
          })
        );
      }

      if (!mansard) {
        boxes.push(...parapets(building, facade.style));
        // Odhams Walk's roofs are terraces, planted up.
        boxes.push(
          ...rooftopClutter(building, random, facade.style === 'odhams' ? planters : undefined)
        );
      }

      return {
        body: extrude(building.footprint, { height: wallHeight, bevel: CORNICE }),
        bodyMaterials: [pick(roofMaterials, random()), walls],
        shopfront: extrude(building.footprint, {
          height: SHOPFRONT_HEIGHT,
          bevel: SHOPFRONT_DEPTH,
        }),
        shopfrontMaterials: [
          new MeshStandardMaterial({ color: wallColour(facade.style), roughness: 0.7 }),
          shopfronts.get(shopfrontKey)!,
        ],
        mansard: mansard ? mansardGeometry(building.footprint, wallHeight) : undefined,
      };
    });

    return { meshes, mansardMaterials, boxes };
  }, []);

  return (
    <group>
      {/* Shapes are drawn in the x–y plane and extruded along +z, so stand them up. */}
      {meshes.map((mesh, i) => (
        <group key={buildings[i]!.id} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh geometry={mesh.body} material={mesh.bodyMaterials} castShadow receiveShadow />
          <mesh
            geometry={mesh.shopfront}
            material={mesh.shopfrontMaterials}
            castShadow
            receiveShadow
          />
          {mesh.mansard && (
            <mesh geometry={mesh.mansard} material={mansardMaterials} castShadow receiveShadow />
          )}
        </group>
      ))}
      <Boxes boxes={boxes} />
    </group>
  );
}

/** Lots of coloured boxes, drawn in one go: parapets, plant rooms, chimneys. */
export function Boxes({ boxes }: { boxes: Box[] }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const colour = new Color();
    boxes.forEach((box, i) => {
      rotation.setFromAxisAngle(up, box.rotation ?? 0);
      matrix.compose(new Vector3(...box.position), rotation, new Vector3(...box.size));
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, colour.set(box.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [boxes]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, boxes.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.6} />
    </instancedMesh>
  );
}

/** A low wall around the edge of a flat roof, capped with a pale coping. */
function parapets(building: Building, style: FacadeStyle): Box[] {
  const { footprint, height } = building;
  return footprint.flatMap((a, i) => {
    const b = footprint[(i + 1) % footprint.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.5) return [];
    const direction: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let inward: Vec2 = [-direction[1], direction[0]];
    if (!insidePolygon([middle[0] + inward[0], middle[1] + inward[1]], footprint)) {
      inward = [-inward[0], -inward[1]];
    }
    // Party walls, shared with the building next door, have no parapet of their own.
    const outside: Vec2 = [middle[0] - inward[0] * 0.6, middle[1] - inward[1] * 0.6];
    if (
      area.buildings.some((other) => other !== building && insidePolygon(outside, other.footprint))
    ) {
      return [];
    }
    const centre: Vec2 = [
      middle[0] + inward[0] * (PARAPET_THICKNESS / 2 - CORNICE),
      middle[1] + inward[1] * (PARAPET_THICKNESS / 2 - CORNICE),
    ];
    const rotation = -Math.atan2(direction[1], direction[0]);
    return [
      {
        position: [centre[0], height + PARAPET_HEIGHT / 2, centre[1]],
        size: [length + PARAPET_THICKNESS, PARAPET_HEIGHT, PARAPET_THICKNESS],
        rotation,
        colour: wallColour(style),
      },
      {
        position: [centre[0], height + PARAPET_HEIGHT + COPING / 2, centre[1]],
        size: [length + PARAPET_THICKNESS + 0.04, COPING, PARAPET_THICKNESS + 0.04],
        rotation,
        colour: trimColour(style),
      },
    ];
  });
}

/**
 * A slate mansard roof sitting on walls `wallHeight` high. Pulling the bevel inwards turns it into
 * a slope from the top of the walls up to a flat top, set back from the edges. The matching slope
 * underneath is hidden inside the building.
 */
function mansardGeometry(footprint: Vec2[], wallHeight: number): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shapeOf(footprint), {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: MANSARD_HEIGHT,
    bevelSize: MANSARD_INSET,
    bevelOffset: -MANSARD_INSET,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, wallHeight);
  return geometry;
}

/**
 * Lead-clad dormer windows along a slate mansard's slope. Its UVs start at the top of the walls,
 * so the visible slope is the lower half of each tile (the bottom of the canvas); the upper half
 * wraps round onto the slope hidden inside the building.
 */
function createDormerTexture(): CanvasTexture {
  return canvasTexture(
    (context, size) => {
      context.fillStyle = colours.slate;
      context.fillRect(0, 0, size, size);
      // Courses of slates.
      context.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let y = 0; y < size; y += 4) context.fillRect(0, y, size, 1);
      context.fillStyle = '#8b939c';
      context.fillRect(size * 0.3, size * 0.58, size * 0.4, size * 0.28);
      context.fillStyle = '#f2efe8';
      context.fillRect(size * 0.34, size * 0.62, size * 0.32, size * 0.2);
      context.fillStyle = colours.window;
      context.fillRect(size * 0.37, size * 0.65, size * 0.26, size * 0.15);
    },
    [2.6, MANSARD_HEIGHT * 2]
  );
}

/**
 * A shop's ground floor, one bay wide: a painted fascia over a big display window and a door,
 * between pilasters, with warm light from inside.
 */
function createShopfrontTexture(fascia: string, pilaster: string): CanvasTexture {
  return canvasTexture(
    (context, size) => {
      context.fillStyle = pilaster;
      context.fillRect(0, 0, size, size);
      // The fascia, with a strip where the shop's name would be: pale on a dark fascia, dark on a
      // pale one.
      context.fillStyle = fascia;
      context.fillRect(size * 0.04, size * 0.06, size * 0.92, size * 0.17);
      context.fillStyle = isPale(fascia) ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.5)';
      context.fillRect(size * 0.18, size * 0.12, size * 0.64, size * 0.05);
      // Display window and door, lit from inside.
      const glass = context.createLinearGradient(0, size * 0.28, 0, size);
      glass.addColorStop(0, colours.shopWindow);
      glass.addColorStop(0.55, '#57636f');
      glass.addColorStop(1, colours.shopGlow);
      context.fillStyle = glass;
      context.fillRect(size * 0.08, size * 0.28, size * 0.58, size * 0.56);
      context.fillRect(size * 0.72, size * 0.28, size * 0.2, size * 0.72);
      // Mullions, and the stall riser under the window.
      context.fillStyle = fascia;
      context.fillRect(size * 0.36, size * 0.28, 2, size * 0.56);
      context.fillRect(size * 0.08, size * 0.84, size * 0.58, size * 0.16);
    },
    [SHOPFRONT_BAY, SHOPFRONT_HEIGHT]
  );
}

function isPale(colour: string): boolean {
  const value = parseInt(colour.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

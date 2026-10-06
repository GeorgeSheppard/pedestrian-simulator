import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  Vector2,
} from 'three';
import type { Building } from '@/data/area';
import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import { insidePolygon, polygonArea } from './geometry';
import { colours, facades, fascias, roofs, rooftopKit } from './palette';

/** One window bay: this much facade, in metres, holds one window. */
const BAY_WIDTH = 3;
const STOREY_HEIGHT = 3.5;
const CORNICE = 0.15;
const SHOPFRONT_HEIGHT = 3.6;
const SHOPFRONT_BAY = 4;
/** How far shopfronts stand proud of the walls above them. */
const SHOPFRONT_DEPTH = 0.4;
const MANSARD_HEIGHT = 2.6;
const MANSARD_INSET = 1;
/** Buildings smaller than this, in square metres, get flat roofs: a mansard would fold in on itself. */
const MANSARD_MIN_AREA = 80;

interface BuildingMesh {
  body: ExtrudeGeometry;
  bodyMaterials: MeshStandardMaterial[];
  shopfront: ExtrudeGeometry;
  shopfrontMaterials: MeshStandardMaterial[];
  mansard?: ExtrudeGeometry;
}

interface RooftopBox {
  position: [number, number, number];
  size: [number, number, number];
  colour: string;
}

export function Buildings() {
  const { meshes, mansardMaterials, rooftop } = useMemo(() => {
    const textures = {
      windows: createWindowTexture(),
      arches: createArchedWindowTexture(),
      dormers: createDormerTexture(),
    };
    const roofMaterials = roofs.map((color) => new MeshStandardMaterial({ color, roughness: 0.8 }));
    const mansardMaterials = [
      new MeshStandardMaterial({ color: colours.slate, roughness: 0.6 }),
      new MeshStandardMaterial({ color: colours.slate, map: textures.dormers, roughness: 0.55 }),
    ];
    const cache = new Map<string, MeshStandardMaterial>();
    const material = (key: string, create: () => MeshStandardMaterial) => {
      if (!cache.has(key)) cache.set(key, create());
      return cache.get(key)!;
    };

    const rooftop: RooftopBox[] = [];
    const meshes = area.buildings.map((building): BuildingMesh => {
      const random = seeded(building.id);
      const isStation = building.kind === 'train_station';
      const colour = isStation ? colours.station : pick(facades, random());
      const roof = pick(roofMaterials, random());
      const fascia = isStation
        ? colours.station
        : housesBoots(building)
          ? colours.boots
          : pick(fascias, random());
      const mansard =
        !isStation && polygonArea(building.footprint) > MANSARD_MIN_AREA && random() < 0.45;
      const wallHeight = mansard ? building.height - MANSARD_HEIGHT : building.height;

      const walls = material(`walls ${colour} ${isStation}`, () => {
        return new MeshStandardMaterial({
          color: colour,
          map: isStation ? textures.arches : textures.windows,
          roughness: isStation ? 0.35 : 0.65,
        });
      });
      const shopfront = material(`shopfront ${fascia}`, () => {
        return new MeshStandardMaterial({ map: createShopfrontTexture(fascia), roughness: 0.4 });
      });

      if (!mansard) rooftop.push(...rooftopClutter(building, random));

      return {
        body: extrude(building.footprint, { height: wallHeight, bevel: CORNICE }),
        bodyMaterials: [roof, walls],
        shopfront: extrude(building.footprint, {
          height: SHOPFRONT_HEIGHT,
          bevel: SHOPFRONT_DEPTH,
        }),
        shopfrontMaterials: [roof, shopfront],
        mansard: mansard ? mansardGeometry(building.footprint, wallHeight) : undefined,
      };
    });

    return { meshes, mansardMaterials, rooftop };
  }, []);

  return (
    <group>
      {/* Shapes are drawn in the x–y plane and extruded along +z, so stand them up. */}
      {meshes.map((mesh, i) => (
        <group key={area.buildings[i]!.id} rotation={[-Math.PI / 2, 0, 0]}>
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
      <RooftopBoxes boxes={rooftop} />
    </group>
  );
}

function RooftopBoxes({ boxes }: { boxes: RooftopBox[] }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const colour = new Color();
    boxes.forEach((box, i) => {
      matrix.makeScale(...box.size).setPosition(...box.position);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, colour.set(box.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [boxes]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, boxes.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.55} />
    </instancedMesh>
  );
}

/** Plant rooms, air-conditioning units and chimney stacks scattered over a flat roof. */
function rooftopClutter(building: Building, random: () => number): RooftopBox[] {
  const xs = building.footprint.map((p) => p[0]);
  const zs = building.footprint.map((p) => p[1]);
  const [minX, maxX, minZ, maxZ] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...zs),
    Math.max(...zs),
  ];
  const count = Math.round(polygonArea(building.footprint) / 70) + 1;
  const boxes: RooftopBox[] = [];
  for (let attempt = 0; attempt < count * 8 && boxes.length < count; attempt++) {
    const chimney = random() < 0.3;
    const size: [number, number, number] = chimney
      ? [0.9, 1.2 + random() * 0.8, 2 + random()]
      : [1.2 + random() * 2.2, 0.7 + random() * 1.4, 1.2 + random() * 2];
    const x = minX + random() * (maxX - minX);
    const z = minZ + random() * (maxZ - minZ);
    const margin = 0.6;
    const corners: Vec2[] = [
      [x - size[0] / 2 - margin, z - size[2] / 2 - margin],
      [x + size[0] / 2 + margin, z - size[2] / 2 - margin],
      [x - size[0] / 2 - margin, z + size[2] / 2 + margin],
      [x + size[0] / 2 + margin, z + size[2] / 2 + margin],
    ];
    if (!corners.every((c) => insidePolygon(c, building.footprint))) continue;
    boxes.push({
      position: [x, building.height + size[1] / 2, z],
      size,
      colour: chimney ? colours.chimney : pick(rooftopKit, random()),
    });
  }
  return boxes;
}

/** Whether this is the building with Boots on the ground floor, across the crossing. */
function housesBoots(building: Building): boolean {
  return area.places.some(
    (p) => p.name === 'Boots' && insidePolygon(p.position, building.footprint)
  );
}

/** A footprint extruded upwards, with its top edge bevelled outwards by `bevel` metres. */
function extrude(footprint: Vec2[], { height, bevel }: { height: number; bevel: number }) {
  return new ExtrudeGeometry(shapeOf(footprint), {
    depth: height - bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
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

function shapeOf(footprint: Vec2[]): Shape {
  // Negate z so that once the shape is rotated upright, it lands back where it belongs.
  return new Shape(footprint.map(([x, z]) => new Vector2(x, -z)));
}

function pick<T>(items: readonly T[], random: number): T {
  return items[Math.floor(random * items.length)]!;
}

/** A small deterministic random number generator, so each building keeps its looks. */
function seeded(key: string): () => number {
  let state = 0;
  for (const char of key) state = (state * 31 + char.charCodeAt(0)) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A tiling texture drawn on a canvas, `tile` metres wide and high on the wall. Extruded walls get
 * UVs in metres, but with v running downwards from 1, so v is flipped to run up from the ground.
 */
function canvasTexture(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  tile: [number, number]
): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / tile[0], -1 / tile[1]);
  texture.offset.set(0, 1 / tile[1]);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * A tile of wall with one window, repeated across every facade. It's white where the wall is, so
 * the material's colour shows through. Extruded walls get UVs in metres, so the repeat is set to
 * one tile per bay and storey.
 */
function createWindowTexture(): CanvasTexture {
  return canvasTexture(
    (context, size) => {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      // A pale surround, then the glass, then the glazing bars.
      context.fillStyle = '#f6f3ec';
      context.fillRect(size * 0.26, size * 0.16, size * 0.48, size * 0.64);
      context.fillStyle = colours.window;
      context.fillRect(size * 0.3, size * 0.2, size * 0.4, size * 0.56);
      context.fillStyle = colours.windowSky;
      context.fillRect(size * 0.3, size * 0.2, size * 0.4, size * 0.16);
      context.fillStyle = '#f6f3ec';
      context.fillRect(size * 0.485, size * 0.2, size * 0.03, size * 0.56);
      context.fillRect(size * 0.3, size * 0.47, size * 0.4, size * 0.03);
    },
    [BAY_WIDTH, STOREY_HEIGHT]
  );
}

/** The station's tall arched windows, set in its glazed tiles. */
function createArchedWindowTexture(): CanvasTexture {
  return canvasTexture(
    (context, size) => {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      const draw = (inset: number, colour: string) => {
        context.fillStyle = colour;
        const left = size * (0.22 + inset);
        const right = size * (0.78 - inset);
        const radius = (right - left) / 2;
        context.beginPath();
        context.moveTo(left, size * (0.85 - inset));
        context.lineTo(left, size * 0.12 + radius);
        context.arc(left + radius, size * 0.12 + radius, radius, Math.PI, 0);
        context.lineTo(right, size * (0.85 - inset));
        context.closePath();
        context.fill();
      };
      draw(0, '#f0d9c8');
      draw(0.04, colours.window);
      context.fillStyle = colours.windowSky;
      context.fillRect(size * 0.26, size * 0.3, size * 0.48, size * 0.08);
    },
    [4, STOREY_HEIGHT]
  );
}

/**
 * Dormer windows along a mansard's slope. Its UVs start at the top of the walls, so the visible
 * slope is the lower half of each tile (the bottom of the canvas); the upper half wraps round onto
 * the slope hidden inside the building.
 */
function createDormerTexture(): CanvasTexture {
  return canvasTexture(
    (context, size) => {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.fillStyle = '#e9e6df';
      context.fillRect(size * 0.3, size * 0.6, size * 0.4, size * 0.24);
      context.fillStyle = colours.window;
      context.fillRect(size * 0.35, size * 0.64, size * 0.3, size * 0.17);
    },
    [BAY_WIDTH, MANSARD_HEIGHT * 2]
  );
}

/** A shop's ground floor, one bay wide: a painted fascia over a big window and a door. */
function createShopfrontTexture(fascia: string): CanvasTexture {
  return canvasTexture(
    (context, size) => {
      context.fillStyle = fascia;
      context.fillRect(0, 0, size, size);
      context.fillStyle = colours.shopWindow;
      context.fillRect(size * 0.06, size * 0.3, size * 0.6, size * 0.6);
      context.fillRect(size * 0.72, size * 0.3, size * 0.2, size * 0.7);
      // Warm light from inside, low in the window.
      context.fillStyle = colours.shopGlow;
      context.fillRect(size * 0.06, size * 0.62, size * 0.6, size * 0.28);
      // A strip of light along the fascia, where the shop's name would be.
      context.fillStyle = 'rgba(255, 255, 255, 0.45)';
      context.fillRect(size * 0.1, size * 0.09, size * 0.8, size * 0.09);
    },
    [SHOPFRONT_BAY, SHOPFRONT_HEIGHT]
  );
}

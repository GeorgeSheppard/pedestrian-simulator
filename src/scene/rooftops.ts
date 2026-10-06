import type { Building } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import type { Box } from './Buildings';
import { insidePolygon, polygonArea } from './geometry';
import { colours, rooftopKit } from './palette';
import { pick } from './random';

/** Roughly how many square metres of flat roof each piece of rooftop kit gets. */
const ROOF_PER_ITEM = 40;

/**
 * Plant rooms, air-conditioning units, chimney stacks and glazed rooflights scattered over a
 * flat roof, kept clear of its edges and of each other.
 */
export function rooftopClutter(
  building: Building,
  random: () => number,
  kit: readonly string[] = rooftopKit
): Box[] {
  const xs = building.footprint.map((p) => p[0]);
  const zs = building.footprint.map((p) => p[1]);
  const [minX, maxX, minZ, maxZ] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...zs),
    Math.max(...zs),
  ];
  const count = Math.round(polygonArea(building.footprint) / ROOF_PER_ITEM) + 1;
  const boxes: Box[] = [];
  for (let attempt = 0; attempt < count * 10 && boxes.length < count; attempt++) {
    const roll = random();
    const kind = roll < 0.3 ? 'chimney' : roll < 0.5 ? 'rooflight' : 'plant';
    const size: [number, number, number] =
      kind === 'chimney'
        ? [0.9, 1.4 + random() * 0.8, 2 + random()]
        : kind === 'rooflight'
          ? [1.6 + random() * 2, 0.35, 1.2 + random() * 1.2]
          : [1 + random() * 1.6, 0.6 + random() * 1.1, 1 + random() * 1.5];
    const x = minX + random() * (maxX - minX);
    const z = minZ + random() * (maxZ - minZ);
    const margin = 0.8;
    const corners: Vec2[] = [
      [x - size[0] / 2 - margin, z - size[2] / 2 - margin],
      [x + size[0] / 2 + margin, z - size[2] / 2 - margin],
      [x - size[0] / 2 - margin, z + size[2] / 2 + margin],
      [x + size[0] / 2 + margin, z + size[2] / 2 + margin],
    ];
    if (!corners.every((c) => insidePolygon(c, building.footprint))) continue;
    const overlaps = boxes.some(
      (b) =>
        Math.abs(b.position[0] - x) < (b.size[0] + size[0]) / 2 + 0.4 &&
        Math.abs(b.position[2] - z) < (b.size[2] + size[2]) / 2 + 0.4
    );
    if (overlaps) continue;
    boxes.push({
      position: [x, building.height + size[1] / 2, z],
      size,
      colour:
        kind === 'chimney'
          ? colours.chimney
          : kind === 'rooflight'
            ? colours.rooflight
            : pick(kit, random()),
    });
  }
  return boxes;
}

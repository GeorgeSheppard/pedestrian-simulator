import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';

export function polygonArea(points: Vec2[]): number {
  let sum = 0;
  points.forEach(([x1, z1], i) => {
    const [x2, z2] = points[(i + 1) % points.length]!;
    sum += x1 * z2 - x2 * z1;
  });
  return Math.abs(sum) / 2;
}

export function insidePolygon([x, z]: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether anything within `clearance` metres of the point is inside a building or off the slab. */
export function isBlocked([x, z]: Vec2, clearance: number): boolean {
  const [width, depth] = area.size;
  if (Math.abs(x) > width / 2 - clearance || Math.abs(z) > depth / 2 - clearance) return true;
  const probes: Vec2[] = [
    [x, z],
    [x + clearance, z],
    [x - clearance, z],
    [x, z + clearance],
    [x, z - clearance],
  ];
  return area.buildings.some((b) => probes.some((p) => insidePolygon(p, b.footprint)));
}

/** A point beside a road segment: `t` of the way along it, `side` metres to its right. */
export function besideRoad(from: Vec2, to: Vec2, t: number, side: number) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const position: Vec2 = [
    from[0] + dx * t + (-dz / length) * side,
    from[1] + dz * t + (dx / length) * side,
  ];
  return { position, heading: Math.atan2(dz, dx), length };
}

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

/** The convex hull of some points, by Andrew's monotone chain. */
export function convexHull(points: Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Vec2[]) => {
    const hull: Vec2[] = [];
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, p) <= 0) {
        hull.pop();
      }
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** How much of its convex hull a polygon fills: 1 for a convex shape, less for L-shapes and notches. */
export function convexity(points: Vec2[]): number {
  const hull = polygonArea(convexHull(points));
  return hull === 0 ? 0 : polygonArea(points) / hull;
}

export interface Face {
  /** The ends of the wall, ordered so that `normal` points to the left of `from` → `to`. */
  from: Vec2;
  to: Vec2;
  length: number;
  /** Unit vector pointing out of the building. */
  normal: Vec2;
  /** Whether there's open ground in front of the wall, rather than another building. */
  street: boolean;
}

/** The walls of a footprint, each with which way is out, and whether it faces the street. */
export function faces(footprint: Vec2[]): Face[] {
  return footprint.map((a, i) => {
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
    return { from, to, length, normal, street };
  });
}

/** A point on a wall: `along` metres from its start, `out` metres in front of it. */
export function onFace(face: Face, along: number, out: number): Vec2 {
  const t = along / face.length;
  return [
    face.from[0] + (face.to[0] - face.from[0]) * t + face.normal[0] * out,
    face.from[1] + (face.to[1] - face.from[1]) * t + face.normal[1] * out,
  ];
}

/** The rotation about y that turns a box's x axis along the wall. */
export function faceRotation(face: Face): number {
  return -Math.atan2(face.to[1] - face.from[1], face.to[0] - face.from[0]);
}

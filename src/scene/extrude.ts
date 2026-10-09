import { ExtrudeGeometry, Shape, Vector2 } from 'three';
import type { Vec2 } from '@/sim/network';

/** A footprint extruded upwards, with its top edge bevelled outwards by `bevel` metres. */
export function extrude(
  footprint: Vec2[],
  { height, bevel, base = 0 }: { height: number; bevel: number; base?: number }
): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shapeOf(footprint), {
    depth: height - base - bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  if (base) geometry.translate(0, 0, base);
  return geometry;
}

export function shapeOf(footprint: Vec2[]): Shape {
  // Negate z so that once the shape is rotated upright, it lands back where it belongs.
  return new Shape(footprint.map(([x, z]) => new Vector2(x, -z)));
}

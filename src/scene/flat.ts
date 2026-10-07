import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Vec2 } from '@/sim/network';

/** A flat piece of a ground layer: a strip along a segment, or a disc filling a bend. */
export type Piece =
  | { kind: 'strip'; from: Vec2; to: Vec2; width: number }
  | { kind: 'disc'; centre: Vec2; radius: number };

const DISC_SEGMENTS = 24;

/**
 * One flat layer of ground, such as a street's paving, as a single geometry lying on y = 0. Its
 * texture coordinates come from world positions, `tile` metres to one copy of the texture, so
 * where pieces overlap, at bends and joins, they show exactly the same pattern and can't flicker
 * against each other.
 */
export function flatLayer(pieces: Piece[], tile: number): BufferGeometry {
  const positions: number[] = [];
  const triangle = (...points: Vec2[]) => {
    for (const [x, z] of points) positions.push(x, 0, z);
  };

  for (const piece of pieces) {
    if (piece.kind === 'strip') {
      const { from, to, width } = piece;
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (length === 0) continue;
      const side: Vec2 = [
        (-(to[1] - from[1]) / length) * (width / 2),
        ((to[0] - from[0]) / length) * (width / 2),
      ];
      const a: Vec2 = [from[0] + side[0], from[1] + side[1]];
      const b: Vec2 = [from[0] - side[0], from[1] - side[1]];
      const c: Vec2 = [to[0] - side[0], to[1] - side[1]];
      const d: Vec2 = [to[0] + side[0], to[1] + side[1]];
      // Wound so the faces point up.
      triangle(a, c, b);
      triangle(a, d, c);
    } else {
      const { centre, radius } = piece;
      for (let i = 0; i < DISC_SEGMENTS; i++) {
        const angle = (i / DISC_SEGMENTS) * Math.PI * 2;
        const next = ((i + 1) / DISC_SEGMENTS) * Math.PI * 2;
        triangle(
          centre,
          [centre[0] + Math.cos(next) * radius, centre[1] + Math.sin(next) * radius],
          [centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius]
        );
      }
    }
  }

  const uvs: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    uvs.push(positions[i]! / tile, -positions[i + 2]! / tile);
  }
  const normals = positions.map((_, i) => (i % 3 === 1 ? 1 : 0));

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * The order flat ground layers draw in, bottom to top. Each is drawn with a depth offset rather
 * than raised by a hair, so they never fight however far away the camera is.
 */
export const LAYERS = { setts: 1, road: 2, edging: 3, markings: 4, crossing: 5 } as const;

/** Material settings that draw a flat layer above the ones below it. */
export function layer(order: number) {
  return { polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order * 4 };
}

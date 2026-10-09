import type { Vec2 } from './network';

/** A point along a path: where it is, and which way the path runs there, in radians. */
export interface PathPoint {
  position: Vec2;
  heading: number;
}

/** Where a point is relative to a path: how far along it, and how far to its left or right. */
export interface Projection {
  /** Distance along the path, in metres. */
  s: number;
  /** Distance from the path, in metres: positive to the right of the direction of travel. */
  lateral: number;
}

/** A path made of straight segments, measured in metres along its length. */
export class Polyline {
  readonly points: readonly Vec2[];
  readonly length: number;
  private readonly starts: number[];

  constructor(points: readonly Vec2[]) {
    if (points.length < 2) throw new Error('A path needs at least two points');
    this.points = points;
    this.starts = [0];
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1]!, points[i]!];
      this.starts.push(this.starts[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.length = this.starts.at(-1)!;
  }

  /** The point `s` metres along the path, carrying straight on past either end. */
  at(s: number): PathPoint {
    let i = 1;
    while (i < this.points.length - 1 && this.starts[i]! < s) i++;
    const [a, b] = [this.points[i - 1]!, this.points[i]!];
    const span = this.starts[i]! - this.starts[i - 1]!;
    const t = (s - this.starts[i - 1]!) / span;
    return {
      position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
    };
  }

  /** Where the nearest point on the path to `point` is. */
  project(point: Vec2): Projection {
    let best: Projection = { s: 0, lateral: Infinity };
    for (let i = 1; i < this.points.length; i++) {
      const [a, b] = [this.points[i - 1]!, this.points[i]!];
      const span = this.starts[i]! - this.starts[i - 1]!;
      const dx = (b[0] - a[0]) / span;
      const dz = (b[1] - a[1]) / span;
      const along = Math.min(span, Math.max(0, (point[0] - a[0]) * dx + (point[1] - a[1]) * dz));
      const nearest: Vec2 = [a[0] + dx * along, a[1] + dz * along];
      const distance = Math.hypot(point[0] - nearest[0], point[1] - nearest[1]);
      if (distance < Math.abs(best.lateral)) {
        // Right of travel is (-dz, dx) in this x–z plane, matching the crowd's lanes.
        const side = (point[0] - nearest[0]) * -dz + (point[1] - nearest[1]) * dx;
        best = { s: this.starts[i - 1]! + along, lateral: side < 0 ? -distance : distance };
      }
    }
    return best;
  }
}

import { insidePolygon, isBlocked } from '@/scene/geometry';
import type { Vec2 } from '@/sim/network';
import { area } from './area';

/**
 * How Covent Garden station is laid out at street level, shared by the model and the crowd.
 *
 * Photos of it show the Long Acre side open across its two bays nearest the corner, into a booking
 * hall with ticket machines and maps on the corner side and the ticket gates across the back of
 * the other side, beyond which people go down to the lifts. On James Street, the three bays of the
 * long frontage are the way out, exit only, with a line of gates right at the street in each.
 */

/** How deep the shallow vestibules behind the other open bays are, in metres. */
export const VESTIBULE_DEPTH = 2.6;
/** How deep the booking hall off Long Acre is. */
export const HALL_DEPTH = 7.5;
/** How far the gates in the James Street exits stand back from the frontage: hardly at all. */
export const EXIT_GATES = 0.8;
/** How far the booking hall's gates stand forward of its back wall. */
export const HALL_GATES = 1.9;
export const PIER_WIDTH = 0.75;
const BAY_TARGET = 4.4;

export type Facing = 'north' | 'east' | 'other';
export type BayUse = 'hall' | 'exit' | 'shop';

export interface Frontage {
  /** Where the frontage starts; looking from `from` to `to`, the street is on the left. */
  from: Vec2;
  to: Vec2;
  length: number;
  /** Unit vector along the frontage, from `from` to `to`. */
  along: Vec2;
  /** Unit vector pointing out into the street. */
  normal: Vec2;
  bays: number;
  facing: Facing;
  /** Whether the frontage turns a street corner at its start and end. */
  corners: [boolean, boolean];
  /** What's behind each bay. */
  uses: BayUse[];
}

export interface BookingHall {
  /** The frontage it opens off. */
  frontage: number;
  /** Where it starts and ends along that frontage, in metres. */
  start: number;
  end: number;
  depth: number;
  /** Where the line of gates starts and ends along the frontage. */
  gates: [number, number];
}

export interface StationLayout {
  footprint: Vec2[];
  frontages: Frontage[];
  hall: BookingHall | null;
  /** Paths through the station, to join on to the street's walking network. */
  walk: {
    nodes: Vec2[];
    edges: [number, number][];
    /** Nodes just outside the doors, to link to the nearest point on the street. */
    doors: number[];
    /** Nodes past the gates, where people heading for a train go. */
    entries: number[];
    /** Nodes past the gates, where people off a train come from. */
    exits: number[];
  };
}

/** A point `along` metres along a frontage and `inside` metres in from it. */
export function onFrontage(frontage: Frontage, along: number, inside: number): Vec2 {
  return [
    frontage.from[0] + frontage.along[0] * along - frontage.normal[0] * inside,
    frontage.from[1] + frontage.along[1] * along - frontage.normal[1] * inside,
  ];
}

/** The station's street frontages: the walls with open pavement in front of them. */
function findFrontages(footprint: Vec2[]): Omit<Frontage, 'uses'>[] {
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
    const facing: Facing = normal[1] < -0.7 ? 'north' : normal[0] > 0.7 ? 'east' : 'other';
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
        along: [(f.to[0] - f.from[0]) / f.length, (f.to[1] - f.from[1]) / f.length] as Vec2,
        normal: f.normal,
        bays: Math.max(1, Math.round(f.length / BAY_TARGET)),
        facing: f.facing,
        corners: (flipped ? [after, before] : [before, after]) as [boolean, boolean],
      };
    });
}

function layOut(): StationLayout | null {
  const station = area.buildings.find((b) => b.kind === 'train_station');
  if (!station) return null;
  const found = findFrontages(station.footprint);
  // The way out is the long frontage on James Street.
  const exitFrontage = found.reduce<(typeof found)[number] | null>(
    (best, f) => (f.facing === 'east' && (!best || f.length > best.length) ? f : best),
    null
  );

  let hall: BookingHall | null = null;
  const frontages: Frontage[] = found.map((frontage, index) => {
    const bay = frontage.length / frontage.bays;
    const uses: BayUse[] = Array.from({ length: frontage.bays }, () => 'shop');
    if (frontage.facing === 'north' && !hall && frontage.bays >= 2 && bay > 2.4) {
      // The two bays nearest the corner open into the booking hall, with the gates behind the
      // bay further from it.
      const fromStart = frontage.corners[0] || !frontage.corners[1];
      const [hallBay, gateBay] = fromStart ? [0, 1] : [frontage.bays - 1, frontage.bays - 2];
      uses[hallBay] = 'hall';
      uses[gateBay] = 'hall';
      const first = Math.min(hallBay, gateBay);
      hall = {
        frontage: index,
        start: first * bay + PIER_WIDTH / 2,
        end: (first + 2) * bay - PIER_WIDTH / 2,
        depth: HALL_DEPTH,
        gates: [gateBay * bay + PIER_WIDTH, (gateBay + 1) * bay - PIER_WIDTH],
      };
    } else if (frontage === exitFrontage && bay > 2.4) {
      uses.fill('exit');
    }
    return { ...frontage, uses };
  });

  // Paths in through the hall's doors to the gates, and out through the James Street exits.
  const nodes: Vec2[] = [];
  const edges: [number, number][] = [];
  const doors: number[] = [];
  const entries: number[] = [];
  const exits: number[] = [];
  const add = (point: Vec2) => nodes.push(point) - 1;

  const booking = hall as BookingHall | null;
  if (booking) {
    const frontage = frontages[booking.frontage]!;
    const bay = frontage.length / frontage.bays;
    const gatesMiddle = (booking.gates[0] + booking.gates[1]) / 2;
    const gateLine = booking.depth - HALL_GATES;
    const beforeGates = add(onFrontage(frontage, gatesMiddle, gateLine - 1.4));
    const pastGates = add(onFrontage(frontage, gatesMiddle, booking.depth - 0.5));
    edges.push([beforeGates, pastGates]);
    entries.push(pastGates);
    exits.push(pastGates);
    frontage.uses.forEach((use, i) => {
      if (use !== 'hall') return;
      const door = add(onFrontage(frontage, (i + 0.5) * bay, 0.8));
      const outside = add(onFrontage(frontage, (i + 0.5) * bay, -1.8));
      edges.push([outside, door], [door, beforeGates]);
      doors.push(outside);
    });
  }
  for (const frontage of frontages) {
    const bay = frontage.length / frontage.bays;
    frontage.uses.forEach((use, i) => {
      if (use !== 'exit') return;
      // People come up from the lifts at the back, through the gates and straight out.
      const pastGates = add(onFrontage(frontage, (i + 0.5) * bay, VESTIBULE_DEPTH - 0.4));
      const door = add(onFrontage(frontage, (i + 0.5) * bay, 0.2));
      const outside = add(onFrontage(frontage, (i + 0.5) * bay, -1.8));
      edges.push([pastGates, door], [door, outside]);
      doors.push(outside);
      exits.push(pastGates);
    });
  }

  return {
    footprint: station.footprint,
    frontages,
    hall: booking,
    walk: { nodes, edges, doors, entries, exits },
  };
}

/** The station's layout, worked out once from the map. */
export const stationLayout = layOut();

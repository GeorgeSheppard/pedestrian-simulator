import { area } from '@/data/area';
import { shopDoors } from '@/data/shops';
import { stationLayout } from '@/data/station';
import { type Vec2, WalkNetwork } from '@/sim/network';
import { Simulation } from '@/sim/simulation';
import type { VehicleKind } from '@/sim/traffic';
import { insidePolygon } from './geometry';

/** How many people walk around, to begin with. */
export const POPULATION = 170;
/** How many vehicles can be on Long Acre at once, to begin with. */
export const USUAL_TRAFFIC = 6;
/** The vehicles that take turns driving along Long Acre: at most this many are on it at once. */
const VEHICLES: VehicleKind[] = [
  'cab',
  'car',
  'cab',
  'van',
  'car',
  'cab',
  'car',
  'van',
  'cab',
  'car',
  'cab',
  'car',
];
/** How far a door can be from the street's paths to join on to them, in metres. */
const DOOR_REACH = 12;

const carriageways = area.roads.filter((r) => r.kind === 'carriageway');

/** Whether a point is in Long Acre's carriageway. */
function inCarriageway([x, z]: Vec2): boolean {
  return carriageways.some((road) => {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[1] - road.from[1];
    const t = Math.max(
      0,
      Math.min(1, ((x - road.from[0]) * dx + (z - road.from[1]) * dz) / (dx * dx + dz * dz))
    );
    const distance = Math.hypot(x - road.from[0] - dx * t, z - road.from[1] - dz * t);
    return distance < road.width / 2;
  });
}

/** Whether a straight walk between two points stays on the pavement, clear of buildings. */
function clear(a: Vec2, b: Vec2): boolean {
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const p: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (inCarriageway(p)) return false;
    if (area.buildings.some((building) => insidePolygon(p, building.footprint))) return false;
  }
  return true;
}

/**
 * A walking network that can grow: points off the paths, like the doors of the station and the
 * shops, join on to the nearest point along any path they can walk straight to.
 */
class NetworkBuilder {
  readonly nodes: Vec2[];
  private edges: [number, number][];

  constructor(nodes: Vec2[], edges: [number, number][]) {
    this.nodes = [...nodes];
    this.edges = [...edges];
  }

  add(point: Vec2): number {
    return this.nodes.push(point) - 1;
  }

  connect(a: number, b: number) {
    this.edges.push([a, b]);
  }

  /** Joins a node on to the nearest path it can reach, splitting that path. Returns success. */
  join(node: number): boolean {
    const point = this.nodes[node]!;
    let best: { edge: number; at: Vec2; distance: number } | null = null;
    this.edges.forEach(([a, b], edge) => {
      if (a === node || b === node) return;
      const [p, q] = [this.nodes[a]!, this.nodes[b]!];
      const dx = q[0] - p[0];
      const dz = q[1] - p[1];
      const length2 = dx * dx + dz * dz;
      if (length2 === 0) return;
      const t = Math.max(
        0,
        Math.min(1, ((point[0] - p[0]) * dx + (point[1] - p[1]) * dz) / length2)
      );
      const at: Vec2 = [p[0] + dx * t, p[1] + dz * t];
      const distance = Math.hypot(point[0] - at[0], point[1] - at[1]);
      if (distance > DOOR_REACH || (best && distance >= best.distance)) return;
      if (!clear(point, at)) return;
      best = { edge, at, distance };
    });
    if (!best) return false;
    const { edge, at } = best as { edge: number; at: Vec2 };
    const [a, b] = this.edges[edge]!;
    const split = this.add(at);
    this.edges.splice(edge, 1, [a, split], [split, b]);
    this.connect(split, node);
    return true;
  }

  build(): WalkNetwork {
    return new WalkNetwork(this.nodes, this.edges);
  }
}

/**
 * The street's walking network, with the paths into the station and the shops joined on. Returns
 * the nodes inside the station people go to and come from, and inside the shops.
 */
function walkNetwork() {
  const builder = new NetworkBuilder(area.walk.nodes, area.walk.edges);
  const entries: number[] = [];
  const exits: number[] = [];
  const shops: number[] = [];

  const station = stationLayout?.walk;
  if (station) {
    const ids = station.nodes.map((point) => builder.add(point));
    for (const [a, b] of station.edges) builder.connect(ids[a]!, ids[b]!);
    for (const door of station.doors) builder.join(ids[door]!);
    entries.push(...station.entries.map((n) => ids[n]!));
    exits.push(...station.exits.map((n) => ids[n]!));
  }

  for (const door of shopDoors) {
    const outside = builder.add(door.outside);
    if (!builder.join(outside)) continue;
    const inside = builder.add(door.inside);
    builder.connect(outside, inside);
    shops.push(inside);
  }

  return { network: builder.build(), entries, exits, shops };
}

/**
 * Long Acre's lane. It's one way here, eastbound, with traffic down the middle between the loading
 * bays marked out along both sides.
 */
function lane(): Vec2[] {
  const segments = area.roads.filter((r) => r.kind === 'carriageway');
  const points: Vec2[] = [segments[0]!.from, ...segments.map((r) => r.to)];
  // Eastbound: from the west (negative x) end to the east.
  return points[0]![0] > points.at(-1)![0] ? points.reverse() : points;
}

/**
 * The people and traffic in the scene, set going with `people` walking about and up to `traffic`
 * vehicles on the road, with `random` for every choice they make.
 */
export function createSimulation({
  people = POPULATION,
  traffic = USUAL_TRAFFIC,
  random = Math.random,
}: { people?: number; traffic?: number; random?: () => number } = {}): Simulation {
  const { network, entries, exits, shops } = walkNetwork();
  const carriageway = area.roads.find((r) => r.kind === 'carriageway');
  const simulation = new Simulation({
    crowd: {
      network,
      entrances: area.walk.spawns,
      station: entries,
      stationExits: exits,
      shops,
      population: people,
    },
    road: {
      lane: lane(),
      halfWidth: (carriageway?.width ?? 8) / 2,
      crossings: area.crossings.map((c) => c.position),
    },
    vehicles: VEHICLES,
    random,
  });
  simulation.vehicleCount = traffic;
  simulation.populate();
  return simulation;
}

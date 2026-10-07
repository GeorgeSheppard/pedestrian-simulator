import { area, shopNodes } from '@/data/area';
import { stationLayout } from '@/data/station';
import { type Vec2, WalkNetwork } from '@/sim/network';
import { Simulation } from '@/sim/simulation';
import type { VehicleKind } from '@/sim/traffic';

const POPULATION = 140;
/** The vehicles that take turns driving along Long Acre. */
const VEHICLES: VehicleKind[] = ['cab', 'car', 'cab', 'van', 'car', 'cab', 'car'];
/** How far a station door can be from the street's paths to join on to them, in metres. */
const DOOR_REACH = 8;

/**
 * The street's walking network, with the paths through the station joined on: each door outside
 * the station links to the nearest point on the street.
 */
function walkNetwork() {
  const nodes: Vec2[] = [...area.walk.nodes];
  const edges: [number, number][] = [...area.walk.edges];
  const offset = nodes.length;
  const station = stationLayout?.walk;
  if (!station) return { network: new WalkNetwork(nodes, edges), entries: [], exits: [] };

  nodes.push(...station.nodes);
  edges.push(...station.edges.map(([a, b]): [number, number] => [a + offset, b + offset]));
  for (const door of station.doors) {
    const point = station.nodes[door]!;
    let nearest = -1;
    let best = DOOR_REACH;
    area.walk.nodes.forEach((node, i) => {
      const d = Math.hypot(node[0] - point[0], node[1] - point[1]);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    if (nearest >= 0) edges.push([nearest, door + offset]);
  }
  return {
    network: new WalkNetwork(nodes, edges),
    entries: station.entries.map((n) => n + offset),
    exits: station.exits.map((n) => n + offset),
  };
}

/**
 * Long Acre's lane. Traffic runs one way, westbound, down the middle, between the loading bays
 * marked out along both sides.
 */
function lane(): Vec2[] {
  const segments = area.roads.filter((r) => r.kind === 'carriageway');
  const points: Vec2[] = [segments[0]!.from, ...segments.map((r) => r.to)];
  // Westbound: from the east (positive x) end to the west.
  return points[0]![0] < points.at(-1)![0] ? points.reverse() : points;
}

/** The people and traffic in the scene, set going, with `random` for every choice they make. */
export function createSimulation(random: () => number = Math.random): Simulation {
  const { network, entries, exits } = walkNetwork();
  const carriageway = area.roads.find((r) => r.kind === 'carriageway');
  const simulation = new Simulation({
    crowd: {
      network,
      entrances: area.walk.spawns,
      station: entries,
      stationExits: exits,
      shops: shopNodes,
      population: POPULATION,
    },
    road: {
      lane: lane(),
      halfWidth: (carriageway?.width ?? 8) / 2,
      crossings: area.crossings.map((c) => c.position),
    },
    vehicles: VEHICLES,
    random,
  });
  simulation.populate();
  return simulation;
}

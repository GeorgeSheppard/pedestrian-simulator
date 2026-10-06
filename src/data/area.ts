import type { Vec2 } from '@/sim/network';
import data from './area.json';

export interface Building {
  id: string;
  name?: string;
  kind: string;
  height: number;
  footprint: Vec2[];
}

export interface Road {
  kind: 'carriageway' | 'pedestrian';
  name?: string;
  width: number;
  from: Vec2;
  to: Vec2;
}

export interface Crossing {
  position: Vec2;
  direction: Vec2;
  width: number;
}

export interface Place {
  kind: 'station' | 'shop';
  name: string;
  position: Vec2;
  node: number;
}

export interface Area {
  attribution: string;
  /** Width along x and depth along z, in metres. */
  size: Vec2;
  buildings: Building[];
  roads: Road[];
  crossings: Crossing[];
  walk: { nodes: Vec2[]; edges: [number, number][]; spawns: number[] };
  places: Place[];
}

/** The area around Covent Garden station, generated from OpenStreetMap by scripts/fetch-osm.mjs. */
export const area = data as unknown as Area;

const unique = (nodes: number[]) => [...new Set(nodes)];

export const stationNodes = unique(
  area.places.filter((p) => p.kind === 'station').map((p) => p.node)
);
export const shopNodes = unique(area.places.filter((p) => p.kind === 'shop').map((p) => p.node));

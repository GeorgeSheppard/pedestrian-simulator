import type { Vec2 } from '@/sim/network';
import data from './area.json';

export interface Building {
  id: string;
  name?: string;
  kind: string;
  height: number;
  /** Storeys above ground, when OpenStreetMap knows. */
  levels?: number;
  /** What the facade is made of, when known: brick, plaster, sandstone and so on. */
  material?: string;
  /** The facade's colour, when known: a name like brown or white, or a hex colour. */
  colour?: string;
  /** A particular look, from photos, where OpenStreetMap's tags don't say enough. */
  look?: string;
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

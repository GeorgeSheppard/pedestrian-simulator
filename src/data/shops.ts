import { faces, onFace } from '@/scene/geometry';
import type { Vec2 } from '@/sim/network';
import { area } from './area';

/**
 * The doors into the shops along the streets. Every building's ground floor is shops, so each wall
 * facing the street gets a door every few bays, with a point on the pavement outside and one inside
 * the shop, for people to walk in and out.
 */

/** How far apart doors along the same wall are, in metres. */
const DOOR_SPACING = 9;
/** Walls shorter than this have no door. */
const MIN_WALL = 4;
/** How far out from the wall people stand to go in, and how far in they go. */
const OUTSIDE = 1.2;
const INSIDE = 2.5;

export interface ShopDoor {
  /** The building the shop's in. */
  building: string;
  /** Where the door is, on the wall, and which way it faces. */
  position: Vec2;
  normal: Vec2;
  /** Where people stand outside to go in, and where they go to inside. */
  outside: Vec2;
  inside: Vec2;
}

function findDoors(): ShopDoor[] {
  const doors: ShopDoor[] = [];
  for (const building of area.buildings) {
    if (building.kind === 'train_station') continue;
    for (const face of faces(building.footprint)) {
      if (!face.street || face.length < MIN_WALL) continue;
      const count = Math.max(1, Math.floor(face.length / DOOR_SPACING));
      for (let i = 0; i < count; i++) {
        const along = (face.length * (i + 0.5)) / count;
        doors.push({
          building: building.id,
          position: onFace(face, along, 0),
          normal: face.normal,
          outside: onFace(face, along, OUTSIDE),
          inside: onFace(face, along, -INSIDE),
        });
      }
    }
  }
  return doors;
}

/** The shop doors, worked out once from the map. */
export const shopDoors = findDoors();

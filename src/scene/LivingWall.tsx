import { area } from '@/data/area';
import type { Vec2 } from '@/sim/network';
import { type Box, Boxes } from './Buildings';
import { type Clump, Clumps } from './Foliage';
import { faceRotation, faces, onFace } from './geometry';
import { flowers, leaves } from './palette';
import { pick, seeded } from './random';

/** Regal House's ground floor is a shopfront; the planting starts above it. */
const PLANTING_FROM = 3.8;
const COLUMN_WIDTH = 2.6;
const WINDOW_WIDTH = 1.55;
const BRONZE = '#3a2f28';
const GLASS = '#2c3843';
const TRAY = '#2e3032';

/**
 * Regal House, on the corner of Long Acre and James Street opposite the station, whose upper
 * floors have been a living wall since 2017: over 8,000 plants of 21 species, mostly greens with
 * flowers of red, pink and mauve. Columns of tall windows in dark bronze frames run up through
 * the planting, some projecting as box windows with planted trays under them, and the planting
 * spills over the top of the walls.
 */
function plant(): { boxes: Box[]; clumps: Clump[] } | null {
  const building = area.buildings.find((b) => b.name === 'Regal House');
  if (!building) return null;
  const random = seeded(building.id);
  const storeys = building.levels ?? Math.max(1, Math.round(building.height / 3.6));
  const storey = building.height / storeys;
  const boxes: Box[] = [];
  const clumps: Clump[] = [];
  const leaf = () => pick(leaves, random());
  const point = (p: Vec2, y: number): [number, number, number] => [p[0], y, p[1]];

  for (const face of faces(building.footprint)) {
    if (!face.street || face.length < 2) continue;
    const rotation = faceRotation(face);
    const columns = Math.max(1, Math.round(face.length / COLUMN_WIDTH));
    const column = face.length / columns;
    const windowAt = (along: number) =>
      Array.from({ length: columns }, (_, i) => (i + 0.5) * column).some(
        (centre) => Math.abs(along - centre) < WINDOW_WIDTH / 2 + 0.15
      );

    for (let i = 0; i < columns; i++) {
      const centre = (i + 0.5) * column;
      const projecting = i % 2 === 0;
      for (let floor = 1; floor < storeys; floor++) {
        const bottom = floor * storey + 0.35;
        const height = storey * 0.72;
        const middle = bottom + height / 2;
        const depth = projecting ? 0.55 : 0.12;
        // The frame, then the glass just inside it.
        boxes.push({
          position: point(onFace(face, centre, depth / 2), middle),
          size: [WINDOW_WIDTH + 0.2, height + 0.2, depth],
          rotation,
          colour: BRONZE,
        });
        boxes.push({
          position: point(onFace(face, centre, depth / 2 + 0.02), middle),
          size: [WINDOW_WIDTH, height, depth],
          rotation,
          colour: GLASS,
        });
        if (projecting) {
          // A tray of plants under the box window.
          const trayOut = depth / 2 + 0.05;
          boxes.push({
            position: point(onFace(face, centre, trayOut), bottom - 0.18),
            size: [WINDOW_WIDTH + 0.45, 0.2, depth + 0.15],
            rotation,
            colour: TRAY,
          });
          for (let k = 0; k < 4; k++) {
            clumps.push({
              position: point(
                onFace(face, centre + (k - 1.5) * 0.4, trayOut + 0.05),
                bottom - 0.02 + random() * 0.1
              ),
              radius: 0.2 + random() * 0.12,
              colour: leaf(),
            });
          }
        }
      }
    }

    // Clumps of planting over the wall between the windows, standing out from it.
    const planted = face.length * (building.height - PLANTING_FROM);
    for (let k = 0; k < planted * 2.6; k++) {
      const along = random() * face.length;
      if (windowAt(along)) continue;
      clumps.push({
        position: point(
          onFace(face, along, 0.08 + random() * 0.18),
          PLANTING_FROM + random() * (building.height - PLANTING_FROM)
        ),
        radius: 0.12 + random() * 0.2,
        colour: leaf(),
      });
    }
    // A scattering of small flowers through it.
    for (let k = 0; k < planted * 0.25; k++) {
      const along = random() * face.length;
      if (windowAt(along)) continue;
      clumps.push({
        position: point(
          onFace(face, along, 0.22 + random() * 0.1),
          PLANTING_FROM + random() * (building.height - PLANTING_FROM)
        ),
        radius: 0.07 + random() * 0.05,
        colour: pick(flowers, random()),
      });
    }
    // And spilling over the top of the wall.
    for (let along = 0.2; along < face.length; along += 0.45) {
      clumps.push({
        position: point(onFace(face, along, random() * 0.3), building.height + random() * 0.3),
        radius: 0.3 + random() * 0.25,
        colour: leaf(),
      });
    }
    // A ledge of planting along the top of the shopfront.
    for (let along = 0.3; along < face.length; along += 0.5) {
      clumps.push({
        position: point(onFace(face, along, 0.45), PLANTING_FROM - 0.05),
        radius: 0.22 + random() * 0.15,
        colour: leaf(),
      });
    }
  }
  return { boxes, clumps };
}

/** The planting depends only on the map, so it's worked out once, when the page loads. */
const parts = plant();

export function LivingWall() {
  if (!parts) return null;
  return (
    <group>
      <Boxes boxes={parts.boxes} />
      <Clumps clumps={parts.clumps} />
    </group>
  );
}

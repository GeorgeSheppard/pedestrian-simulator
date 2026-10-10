import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Building } from '@/data/area';
import { colours } from './palette';

/**
 * The kinds of facade around the junction, as seen in photos of it: London stock brick and red
 * brick terraces with white sash windows, white stucco, pale Portland stone, and the Victorian
 * shops and offices of red brick banded with white that line much of Long Acre. A few landmarks
 * have their own: Regal House's living wall, Odhams Walk's dark brown 1970s brick, the plain
 * red-brown brick with dark modern windows across from the station (Boots and Russell & Bromley),
 * and the Victorian buff brick down James Street, latticed with red brick diamonds.
 */
export type FacadeStyle =
  'stock' | 'red' | 'banded' | 'stucco' | 'stone' | 'living' | 'odhams' | 'modern' | 'victorian';

export interface Facade {
  style: FacadeStyle;
  /** Which of a style's window designs: 0, 1 or 2. */
  variant: number;
  /** Whether it's the real building's look, from photos, rather than a guess. */
  photographed?: boolean;
}

const FACADES: Record<FacadeStyle, { wall: string; trim: string; bay: number }> = {
  stock: { wall: '#b39a74', trim: '#e2ddd2', bay: 2.6 },
  red: { wall: '#a4523b', trim: '#e2ddd2', bay: 2.6 },
  banded: { wall: '#ad5539', trim: '#eee9df', bay: 2.6 },
  stucco: { wall: '#efe9de', trim: '#dfd7c8', bay: 2.8 },
  stone: { wall: '#ddd5c3', trim: '#cfc6b2', bay: 3 },
  living: { wall: '#4f6b35', trim: '#3a2f28', bay: 2.8 },
  odhams: { wall: '#6a4536', trim: '#b9b2a4', bay: 3.4 },
  modern: { wall: '#8c4a37', trim: '#d9d3c7', bay: 3.2 },
  victorian: { wall: '#c8a873', trim: '#a8503a', bay: 2.8 },
};

/** Landmarks that photos show have a look of their own, by name. */
const LANDMARK_STYLES: Record<string, FacadeStyle> = {
  'Regal House': 'living',
  'Odhams Walk': 'odhams',
  // Both in 107-115 Long Acre, across from the station.
  Boots: 'modern',
  'Russell & Bromley': 'modern',
};

/**
 * Other buildings whose fronts photos show (on Geograph and Wikimedia Commons), by their
 * OpenStreetMap id, rather than guessed from what the map says they're made of.
 */
const PHOTOGRAPHED: Record<string, Facade> = {
  // Long Acre west of the station, along the station side: red brick banded in white, then white
  // stucco, Muji's white stucco between red brick piers, more stucco, and plain red brick.
  'way/173544298': { style: 'banded', variant: 0 },
  'way/173544320': { style: 'stucco', variant: 1 },
  'way/173544289': { style: 'banded', variant: 2 },
  'way/173544267': { style: 'stucco', variant: 2 },
  'way/173544293': { style: 'red', variant: 1 },
  // 48-52 Long Acre, past Regal House: late Georgian stock brick, with six-over-six sashes under
  // rubbed brick arches.
  'way/173544664': { style: 'stock', variant: 0 },
  // On James Street, south of the station: red brick banded in white, with white sashes.
  'way/173544246': { style: 'banded', variant: 1 },
  // Hobbs, across Long Acre: red-brown brick with dark windows.
  'way/206248411': { style: 'modern', variant: 0 },
};

/** Picks a facade for a building from what OpenStreetMap says it's made of, or from its id. */
export function facadeFor(building: Building, random: () => number): Facade {
  const material = building.material;
  const colour = building.colour;
  const landmark = building.name ? LANDMARK_STYLES[building.name] : undefined;
  let style: FacadeStyle;
  if (building.look === 'victorian') style = 'victorian';
  else if (landmark) style = landmark;
  else if (material === 'plaster' || colour === 'white') style = 'stucco';
  else if (material === 'sandstone' || material === 'stone') style = 'stone';
  else if (colour === 'brown' || colour === 'light_brown') style = 'stock';
  else if (material === 'brick') style = random() < 0.55 ? 'red' : 'stock';
  else {
    const roll = random();
    style = roll < 0.35 ? 'stock' : roll < 0.65 ? 'red' : roll < 0.85 ? 'stucco' : 'stone';
  }
  const variant = Math.floor(random() * 3);
  // Guess first even for the photographed ones, so every building draws the same random numbers
  // after this as before.
  const photographed = PHOTOGRAPHED[building.id];
  if (photographed) return { ...photographed, photographed: true };
  return { style, variant, photographed: building.look !== undefined || landmark !== undefined };
}

/**
 * A tiling texture drawn on a canvas, `tile` metres wide and high on the wall. Extruded walls get
 * UVs in metres, but with v running downwards from 1, so v is flipped to run up from the ground.
 */
export function canvasTexture(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  tile: [number, number],
  size = 128
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return retile(texture, tile);
}

/** Sets how many metres one copy of the texture covers on the wall. */
export function retile(texture: CanvasTexture, tile: [number, number]): CanvasTexture {
  texture.repeat.set(1 / tile[0], -1 / tile[1]);
  texture.offset.set(0, 1 / tile[1]);
  return texture;
}

/** A little colour noise, so brick and stone read as textured rather than flat paint. */
function speckle(context: CanvasRenderingContext2D, size: number, base: string, amount: number) {
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < size * size * 0.35; i++) {
    const shade = random() < 0.5 ? 0 : 255;
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${random() * amount})`;
    context.fillRect(Math.floor(random() * size), Math.floor(random() * size), 2, 1);
  }
}

/** A living wall: overlapping leaves in many greens, with a few flowers of red, pink and mauve. */
function foliage(context: CanvasRenderingContext2D, size: number) {
  context.fillStyle = '#3f5a2c';
  context.fillRect(0, 0, size, size);
  let seed = 19;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const leaves = ['#4f6f33', '#5d7f3a', '#6f8f45', '#3d5a2a', '#7a9a4f', '#58753a', '#86a35a'];
  for (let i = 0; i < 900; i++) {
    context.fillStyle = leaves[Math.floor(random() * leaves.length)]!;
    context.beginPath();
    context.arc(random() * size, random() * size, 1.5 + random() * 3, 0, Math.PI * 2);
    context.fill();
  }
  const flowers = ['#c4425a', '#d77fa1', '#8c5a9e', '#e2a43b'];
  for (let i = 0; i < 40; i++) {
    context.fillStyle = flowers[Math.floor(random() * flowers.length)]!;
    context.fillRect(random() * size, random() * size, 2, 2);
  }
}

/** A colour made lighter (amount > 0) or darker (amount < 0), as a CSS colour. */
function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    const target = amount > 0 ? 255 : 0;
    return Math.round(c + (target - c) * Math.abs(amount));
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function lcg(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * Draws on one tile of facade in metres: x across the bay from its left edge, y down from the top
 * of the storey.
 */
class Pen {
  readonly sx: number;
  readonly sy: number;

  constructor(
    readonly context: CanvasRenderingContext2D,
    size: number,
    readonly bay: number,
    readonly storey: number
  ) {
    this.sx = size / bay;
    this.sy = size / storey;
  }

  rect(x: number, y: number, w: number, h: number, fill: string | CanvasGradient) {
    this.context.fillStyle = fill;
    this.context.fillRect(x * this.sx, y * this.sy, w * this.sx, h * this.sy);
  }

  /** A shadow cast down by a projecting ledge at `y`. */
  ledge(x: number, y: number, w: number, h: number, fill: string) {
    this.rect(x, y + h, w, 0.05, 'rgba(0, 0, 0, 0.22)');
    this.rect(x, y, w, h, fill);
    this.rect(x, y, w, 0.015, 'rgba(255, 255, 255, 0.35)');
  }
}

/** Brick in stretcher bond: every brick a slightly different shade, with lighter mortar. */
function brickwork(pen: Pen, base: string, random: () => number, diaper?: string) {
  const { bay, storey } = pen;
  pen.rect(0, 0, bay, storey, shade(base, 0.35));
  const course = 0.075;
  const brick = 0.225;
  for (let row = 0; row * course < storey; row++) {
    const y = row * course;
    for (let x = row % 2 === 0 ? 0 : -brick / 2; x < bay; x += brick) {
      let colour = shade(base, (random() - 0.5) * 0.22);
      if (random() < 0.05) colour = shade(base, -0.28);
      if (diaper) {
        // A lattice of diamonds in another brick, as on the Victorian building down James Street.
        const u = (x + brick / 2) / 1.4;
        const v = (y + course / 2) / 0.9;
        const a = Math.abs(((u + v) % 1) - 0.5);
        const b = Math.abs(((((u - v) % 1) + 1) % 1) - 0.5);
        if (a < 0.07 || b < 0.07) colour = shade(diaper, (random() - 0.5) * 0.1);
      }
      pen.context.fillStyle = colour;
      pen.context.fillRect(
        x * pen.sx + 0.5,
        y * pen.sy + 0.5,
        brick * pen.sx - 1,
        course * pen.sy - 1
      );
    }
  }
}

/** Smooth render or stone, with a little grain. */
function render(pen: Pen, base: string, amount: number) {
  speckle(pen.context, Math.max(pen.bay * pen.sx, pen.storey * pen.sy), base, amount);
}

type Head = 'flat' | 'segmental' | 'pointed' | 'round';

interface Opening {
  x: number;
  y: number;
  w: number;
  h: number;
  head: Head;
}

/** The outline of a window opening, grown outwards by `grow` metres, as a path in pixels. */
function openingPath(pen: Pen, { x, y, w, h, head }: Opening, grow = 0, dx = 0, dy = 0) {
  const { context, sx, sy } = pen;
  const left = (x - grow + dx) * sx;
  const right = (x + w + grow + dx) * sx;
  const bottom = (y + h + grow + dy) * sy;
  const top = (y - grow + dy) * sy;
  context.beginPath();
  if (head === 'flat') {
    context.rect(left, top, right - left, bottom - top);
    return;
  }
  if (head === 'round') {
    // A semicircular head, as wide as the window, springing from its sides.
    // The tile's stretched to a square canvas, so the circle's an ellipse in pixels.
    const across = (right - left) / 2;
    const up = (across / sx) * sy;
    context.moveTo(left, bottom);
    context.lineTo(left, top + up);
    context.ellipse((left + right) / 2, top + up, across, up, 0, Math.PI, 0);
    context.lineTo(right, bottom);
    context.closePath();
    return;
  }
  const rise = (head === 'segmental' ? 0.18 : w * 0.6) * sy;
  context.moveTo(left, bottom);
  context.lineTo(left, top + rise);
  if (head === 'segmental') {
    context.quadraticCurveTo((left + right) / 2, top - rise, right, top + rise);
  } else {
    // A pointed Gothic arch, from two curves meeting at the top.
    context.quadraticCurveTo(left, top, (left + right) / 2, top);
    context.quadraticCurveTo(right, top, right, top + rise);
  }
  context.lineTo(right, bottom);
  context.closePath();
}

/**
 * A window set back in its opening: a shadowed reveal, a painted frame, glass catching the sky at
 * the top, and glazing bars dividing it into `columns` by `rows` panes.
 */
function drawWindow(
  pen: Pen,
  opening: Opening,
  { frame, columns, rows, wall }: { frame: string; columns: number; rows: number; wall: string }
) {
  const { context, sx, sy } = pen;
  // The reveal: in shadow along the top and one side, lit along the other.
  context.fillStyle = shade(wall, -0.5);
  openingPath(pen, opening);
  context.fill();
  context.fillStyle = shade(wall, 0.15);
  openingPath(pen, opening, -0.04, 0.03, 0.04);
  context.fill();
  // The frame, set back.
  context.fillStyle = frame;
  openingPath(pen, opening, -0.07, 0.03, 0.04);
  context.fill();
  // The glass.
  const glass = context.createLinearGradient(0, opening.y * sy, 0, (opening.y + opening.h) * sy);
  glass.addColorStop(0, colours.windowSky);
  glass.addColorStop(0.3, colours.window);
  glass.addColorStop(1, '#2f3b48');
  context.fillStyle = glass;
  openingPath(pen, opening, -0.12, 0.03, 0.04);
  context.fill();
  // Glazing bars, clipped to the glass.
  context.save();
  openingPath(pen, opening, -0.12, 0.03, 0.04);
  context.clip();
  context.fillStyle = frame;
  const { x, y, w, h } = opening;
  for (let c = 1; c < columns; c++) {
    context.fillRect((x + 0.03 + (w * c) / columns) * sx - 0.75, y * sy, 1.5, h * sy);
  }
  for (let r = 1; r < rows * 2; r++) {
    const thick = r === rows ? 3 : 1.5;
    context.fillRect(x * sx, (y + 0.04 + (h * r) / (rows * 2)) * sy - thick / 2, w * sx, thick);
  }
  context.restore();
}

/** One bay of one storey of a facade in the given style, with the colours baked in. */
export function facadeTexture(style: FacadeStyle, storey: number, variant = 0): CanvasTexture {
  const { wall, trim, bay } = FACADES[style];
  return canvasTexture(
    (context, size) => {
      const pen = new Pen(context, size, bay, storey);
      const random = lcg(7 + variant * 101 + Math.round(storey * 10));
      const top = storey * 0.17;
      const height = storey * 0.55;
      const centre = (w: number): Opening => ({
        x: (bay - w) / 2,
        y: top,
        w,
        h: height,
        head: 'flat',
      });

      if (style === 'stock' || style === 'red') {
        brickwork(pen, wall, random);
        const opening = { ...centre(1), head: (variant === 2 ? 'segmental' : 'flat') as Head };
        const { x, w } = opening;
        if (variant === 0) {
          // A flat arch of rubbed red brick over the window.
          const arch = style === 'stock' ? '#b45a3e' : '#c26a4c';
          context.fillStyle = arch;
          context.beginPath();
          context.moveTo((x - 0.12) * pen.sx, (top - 0.26) * pen.sy);
          context.lineTo((x + w + 0.12) * pen.sx, (top - 0.26) * pen.sy);
          context.lineTo((x + w) * pen.sx, top * pen.sy);
          context.lineTo(x * pen.sx, top * pen.sy);
          context.fill();
          context.fillStyle = 'rgba(255, 255, 255, 0.25)';
          for (let i = 1; i < 9; i++) {
            const t = i / 9;
            context.fillRect(
              (x - 0.12 + (w + 0.24) * t) * pen.sx,
              (top - 0.26) * pen.sy,
              1,
              0.26 * pen.sy
            );
          }
        } else if (variant === 1) {
          // A stone lintel with a keystone, and a stone band at the floor.
          pen.ledge(x - 0.14, top - 0.2, w + 0.28, 0.2, trim);
          pen.ledge(bay / 2 - 0.1, top - 0.26, 0.2, 0.26, shade(trim, 0.2));
          pen.ledge(0, storey - 0.14, bay, 0.1, trim);
        } else {
          // A segmental arch of brick on edge.
          context.strokeStyle = shade(wall, -0.18);
          context.lineWidth = 0.12 * pen.sy;
          openingPath(pen, opening, 0.07);
          context.stroke();
        }
        drawWindow(pen, opening, {
          frame: '#f4f1ea',
          columns: variant === 0 ? 3 : 2,
          rows: variant === 0 ? 2 : 1,
          wall,
        });
        pen.ledge(x - 0.08, top + height, w + 0.16, 0.08, trim);
      } else if (style === 'banded') {
        // Victorian shops and offices: red brick banded with white, white surrounds and two-over-two
        // sashes. Some are mostly white stucco, with only piers of red brick between the windows.
        if (variant === 2) {
          render(pen, trim, 0.035);
          for (const x of [0, bay - 0.4]) {
            pen.context.save();
            pen.context.beginPath();
            pen.context.rect(x * pen.sx, 0, 0.4 * pen.sx, storey * pen.sy);
            pen.context.clip();
            brickwork(pen, wall, random);
            pen.context.restore();
          }
        } else {
          brickwork(pen, wall, random);
        }
        // A white band at the floor, and another along the window heads.
        pen.ledge(0, storey - 0.18, bay, 0.16, trim);
        if (variant !== 2) pen.rect(0, top - 0.2, bay, 0.12, trim);
        const opening = { ...centre(1.05), head: (variant === 1 ? 'segmental' : 'flat') as Head };
        const { x, w } = opening;
        // A white surround, with a keystone.
        context.fillStyle = shade(trim, -0.06);
        openingPath(pen, opening, 0.11);
        context.fill();
        context.fillStyle = trim;
        openingPath(pen, opening, 0.09);
        context.fill();
        pen.ledge(bay / 2 - 0.09, top - 0.3, 0.18, 0.3, shade(trim, 0.1));
        drawWindow(pen, opening, { frame: '#f6f3ec', columns: 2, rows: 1, wall });
        pen.ledge(x - 0.16, top + height, w + 0.32, 0.1, trim);
      } else if (style === 'victorian') {
        // Buff brick latticed with red brick diamonds, and round-headed windows under red brick
        // arches, with red brick bands at the floors.
        brickwork(pen, wall, random, trim);
        const opening = { ...centre(0.9), head: 'round' as Head };
        pen.ledge(0, storey - 0.12, bay, 0.1, trim);
        context.fillStyle = trim;
        openingPath(pen, opening, 0.12);
        context.fill();
        drawWindow(pen, opening, { frame: '#f2efe6', columns: 2, rows: 2, wall });
        pen.ledge(opening.x - 0.1, top + height, opening.w + 0.2, 0.08, '#e6dcc4');
      } else if (style === 'stucco') {
        render(pen, wall, 0.035);
        // Faint lines of rustication, and a cornice along the floor.
        for (let y = 0.4; y < storey; y += 0.4) pen.rect(0, y, bay, 0.012, 'rgba(0, 0, 0, 0.05)');
        pen.ledge(0, storey - 0.16, bay, 0.12, shade(wall, 0.3));
        const opening = centre(1.05);
        const { x, w } = opening;
        // A moulded architrave round the window, catching the light on one side.
        pen.rect(x - 0.13, top - 0.13, w + 0.26, height + 0.13, shade(trim, -0.05));
        pen.rect(x - 0.1, top - 0.1, w + 0.2, height + 0.1, shade(trim, 0.25));
        if (variant === 1) {
          // A hood on brackets over the window.
          pen.ledge(x - 0.22, top - 0.32, w + 0.44, 0.12, shade(wall, 0.4));
          pen.rect(x - 0.18, top - 0.2, 0.07, 0.1, shade(trim, -0.1));
          pen.rect(x + w + 0.11, top - 0.2, 0.07, 0.1, shade(trim, -0.1));
        }
        drawWindow(pen, opening, {
          frame: '#f8f6f1',
          columns: variant === 1 ? 2 : 3,
          rows: variant === 1 ? 1 : 2,
          wall,
        });
        pen.ledge(x - 0.15, top + height, w + 0.3, 0.08, shade(wall, 0.3));
        if (variant === 2) {
          // A little black iron balconette across the bottom of the window.
          const rail = '#24262a';
          pen.rect(x - 0.08, top + height - 0.42, w + 0.16, 0.035, rail);
          for (let i = 0; i <= 8; i++) {
            pen.rect(x - 0.08 + ((w + 0.16) * i) / 8, top + height - 0.42, 0.02, 0.4, rail);
          }
        }
      } else if (style === 'stone') {
        render(pen, wall, 0.05);
        // Ashlar: big blocks of Portland stone, in courses.
        const courseHeight = storey / 6;
        for (let row = 0; row < 6; row++) {
          pen.rect(0, row * courseHeight, bay, 0.012, 'rgba(0, 0, 0, 0.07)');
          const offset = row % 2 === 0 ? 0 : 0.5;
          for (let x = offset; x < bay; x += 1) {
            pen.rect(x, row * courseHeight, 0.012, courseHeight, 'rgba(0, 0, 0, 0.06)');
          }
        }
        const opening = centre(1.1);
        const { x, w } = opening;
        pen.rect(x - 0.12, top - 0.12, w + 0.24, height + 0.12, shade(trim, 0.15));
        if (variant === 1) {
          // A triangular pediment over the window.
          context.fillStyle = 'rgba(0, 0, 0, 0.2)';
          context.beginPath();
          context.moveTo((x - 0.22) * pen.sx, (top - 0.1) * pen.sy);
          context.lineTo((x + w + 0.22) * pen.sx, (top - 0.1) * pen.sy);
          context.lineTo((bay / 2) * pen.sx, (top - 0.42) * pen.sy);
          context.fill();
          context.fillStyle = shade(trim, 0.3);
          context.beginPath();
          context.moveTo((x - 0.22) * pen.sx, (top - 0.14) * pen.sy);
          context.lineTo((x + w + 0.22) * pen.sx, (top - 0.14) * pen.sy);
          context.lineTo((bay / 2) * pen.sx, (top - 0.46) * pen.sy);
          context.fill();
        }
        drawWindow(pen, opening, {
          frame: '#efece4',
          columns: variant === 0 ? 3 : 2,
          rows: variant === 0 ? 2 : 1,
          wall,
        });
        pen.ledge(x - 0.15, top + height, w + 0.3, 0.09, shade(trim, 0.2));
      } else if (style === 'modern') {
        brickwork(pen, wall, random);
        // A plain stone band at each floor, and pairs of dark modern windows.
        pen.ledge(0, storey - 0.12, bay, 0.1, trim);
        for (const x of [0.45, 1.75]) {
          const opening: Opening = { x, y: top, w: 1, h: height, head: 'flat' };
          drawWindow(pen, opening, { frame: '#2e3033', columns: 2, rows: 1, wall });
        }
      } else if (style === 'living') {
        // Just the planting: the windows are modelled in 3D, in LivingWall.
        foliage(context, size);
      } else if (style === 'odhams') {
        brickwork(pen, wall, random);
        // A plain, wide modern window over a concrete sill band.
        const opening: Opening = { x: 0.5, y: top + 0.2, w: 2.4, h: height - 0.3, head: 'flat' };
        drawWindow(pen, opening, { frame: '#2b2a2a', columns: 2, rows: 1, wall });
        pen.ledge(0, top + height - 0.05, bay, 0.14, trim);
      }
    },
    [bay, storey],
    256
  );
}

/** Plain wall in the facade's colour, for parapets and the like. */
export function wallColour(style: FacadeStyle): string {
  return FACADES[style].wall;
}

export function trimColour(style: FacadeStyle): string {
  return FACADES[style].trim;
}

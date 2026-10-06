import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Building } from '@/data/area';
import { colours } from './palette';

/**
 * The kinds of facade around the junction, as seen in photos of it: sooty yellow London stock
 * brick and red brick terraces with white sash windows, white stucco, and pale Portland stone.
 */
export type FacadeStyle = 'stock' | 'red' | 'stucco' | 'stone';

export interface Facade {
  style: FacadeStyle;
  /** Metres per window bay, across the facade. */
  bay: number;
}

const FACADES: Record<FacadeStyle, { wall: string; trim: string; bay: number }> = {
  stock: { wall: '#b49870', trim: '#d8d2c6', bay: 2.6 },
  red: { wall: '#a6533c', trim: '#d8d2c6', bay: 2.6 },
  stucco: { wall: '#eee8dc', trim: '#dcd4c4', bay: 2.8 },
  stone: { wall: '#ddd4c1', trim: '#cbc1ab', bay: 3 },
};

/** Picks a facade for a building from what OpenStreetMap says it's made of, or from its id. */
export function facadeFor(building: Building, random: () => number): Facade {
  const material = building.material;
  const colour = building.colour;
  let style: FacadeStyle;
  if (material === 'plaster' || colour === 'white') style = 'stucco';
  else if (material === 'sandstone' || material === 'stone') style = 'stone';
  else if (colour === 'brown' || colour === 'light_brown') style = 'stock';
  else if (material === 'brick') style = random() < 0.55 ? 'red' : 'stock';
  else {
    const roll = random();
    style = roll < 0.35 ? 'stock' : roll < 0.65 ? 'red' : roll < 0.85 ? 'stucco' : 'stone';
  }
  return { style, bay: FACADES[style].bay };
}

const SIZE = 128;

/**
 * A tiling texture drawn on a canvas, `tile` metres wide and high on the wall. Extruded walls get
 * UVs in metres, but with v running downwards from 1, so v is flipped to run up from the ground.
 */
export function canvasTexture(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  tile: [number, number]
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  draw(canvas.getContext('2d')!, SIZE);
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

/** Brick courses: faint lighter lines of mortar. */
function courses(context: CanvasRenderingContext2D, size: number) {
  context.fillStyle = 'rgba(255, 255, 255, 0.07)';
  for (let y = 1; y < size; y += 3) context.fillRect(0, y, size, 1);
}

/** A sash window: a painted frame around six-over-six panes, with sky caught in the top. */
function sashWindow(
  context: CanvasRenderingContext2D,
  [x, y, w, h]: [number, number, number, number],
  frame: string
) {
  context.fillStyle = frame;
  context.fillRect(x, y, w, h);
  const inset = Math.max(2, Math.round(w * 0.1));
  const gx = x + inset;
  const gy = y + inset;
  const gw = w - inset * 2;
  const gh = h - inset * 2;
  const glass = context.createLinearGradient(0, gy, 0, gy + gh);
  glass.addColorStop(0, colours.windowSky);
  glass.addColorStop(0.35, colours.window);
  glass.addColorStop(1, '#3e4c5b');
  context.fillStyle = glass;
  context.fillRect(gx, gy, gw, gh);
  context.fillStyle = frame;
  // Meeting rail, and the glazing bars of each sash.
  context.fillRect(gx, gy + gh / 2 - 1, gw, 2);
  for (const t of [1 / 3, 2 / 3]) context.fillRect(gx + gw * t - 0.5, gy, 1, gh);
  context.fillRect(gx, gy + gh / 4, gw, 1);
  context.fillRect(gx, gy + (gh * 3) / 4, gw, 1);
}

/** One bay of one storey of a facade in the given style, with the colours baked in. */
export function facadeTexture(style: FacadeStyle, storey: number): CanvasTexture {
  const { wall, trim, bay } = FACADES[style];
  return canvasTexture(
    (context, size) => {
      const window: [number, number, number, number] = [
        size * 0.3,
        size * 0.2,
        size * 0.4,
        size * 0.58,
      ];
      const [x, y, w, h] = window;
      if (style === 'stock' || style === 'red') {
        speckle(context, size, wall, 0.12);
        courses(context, size);
        // A gauged brick arch over the window, and a stone sill under it.
        context.fillStyle = style === 'stock' ? '#a4543d' : '#8f4130';
        context.fillRect(x - 3, y - 6, w + 6, 6);
        context.fillStyle = trim;
        context.fillRect(x - 3, y + h, w + 6, 4);
        sashWindow(context, window, '#f4f1ea');
      } else if (style === 'stucco') {
        speckle(context, size, wall, 0.04);
        // Rusticated lines, and a moulded surround to the window.
        context.fillStyle = 'rgba(0, 0, 0, 0.06)';
        context.fillRect(0, size - 2, size, 2);
        context.fillStyle = trim;
        context.fillRect(x - 5, y - 5, w + 10, h + 10);
        context.fillStyle = wall;
        context.fillRect(x - 3, y - 3, w + 6, h + 6);
        context.fillStyle = trim;
        context.fillRect(x - 7, y - 10, w + 14, 4);
        sashWindow(context, window, '#f7f5f0');
      } else {
        speckle(context, size, wall, 0.06);
        context.fillStyle = 'rgba(0, 0, 0, 0.05)';
        for (let line = 0; line < size; line += size / 4) context.fillRect(0, line, size, 1);
        context.fillStyle = trim;
        context.fillRect(x - 4, y - 4, w + 8, h + 8);
        sashWindow(context, window, '#ece8df');
      }
    },
    [bay, storey]
  );
}

/** Plain wall in the facade's colour, for parapets and the like. */
export function wallColour(style: FacadeStyle): string {
  return FACADES[style].wall;
}

export function trimColour(style: FacadeStyle): string {
  return FACADES[style].trim;
}

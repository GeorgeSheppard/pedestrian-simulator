import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { colours } from './palette';

/** How many metres one tile of each surface texture covers. */
export const FLAG_TILE = 2.4;
export const SETT_TILE = 1.6;
export const ASPHALT_TILE = 4;

function surface(draw: (context: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function noise(context: CanvasRenderingContext2D, size: number, amount: number, seed = 3) {
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < size * size * 0.3; i++) {
    const shade = random() < 0.5 ? 0 : 255;
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${random() * amount})`;
    context.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
  }
  return random;
}

/** York stone paving flags in staggered courses, each a slightly different shade. */
export function flagsTexture(): CanvasTexture {
  return surface((context, size) => {
    context.fillStyle = colours.pavement;
    context.fillRect(0, 0, size, size);
    const random = noise(context, size, 0.06);
    const rows = 4;
    const rowHeight = size / rows;
    for (let row = 0; row < rows; row++) {
      let x = row % 2 === 0 ? 0 : -size / 6;
      while (x < size) {
        const width = size / 3 + (random() - 0.5) * size * 0.12;
        const shade = (random() - 0.5) * 0.08;
        context.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
        context.fillRect(x, row * rowHeight, width, rowHeight);
        context.fillStyle = 'rgba(0, 0, 0, 0.12)';
        context.fillRect(x, row * rowHeight, 1, rowHeight);
        x += width;
      }
      context.fillStyle = 'rgba(0, 0, 0, 0.12)';
      context.fillRect(0, row * rowHeight, size, 1);
    }
  });
}

/** Granite setts, small and grey, laid in courses across the street. */
export function settsTexture(): CanvasTexture {
  return surface((context, size) => {
    context.fillStyle = colours.setts;
    context.fillRect(0, 0, size, size);
    const random = noise(context, size, 0.08, 11);
    const rows = 8;
    const rowHeight = size / rows;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 === 0 ? 0 : size / 16;
      for (let x = -offset; x < size; x += size / 8) {
        const shade = (random() - 0.5) * 0.14;
        context.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
        context.fillRect(x + 1, row * rowHeight + 1, size / 8 - 2, rowHeight - 2);
      }
      context.fillStyle = 'rgba(0, 0, 0, 0.14)';
      context.fillRect(0, row * rowHeight, size, 1);
    }
  });
}

/** Asphalt, with a little grain so it isn't a flat grey. */
export function asphaltTexture(): CanvasTexture {
  return surface((context, size) => {
    context.fillStyle = colours.road;
    context.fillRect(0, 0, size, size);
    noise(context, size, 0.1, 5);
  });
}

/** A copy of a surface texture that tiles across a surface `width` by `height` metres. */
export function tiled(texture: CanvasTexture, width: number, height: number, tile: number) {
  const copy = texture.clone();
  copy.repeat.set(width / tile, height / tile);
  return copy;
}

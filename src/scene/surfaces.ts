import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * The ground's surfaces, as in photos of the junction: grey concrete paving flags on the
 * pavements, small grey granite setts on James Street and Neal Street, and Long Acre's carriageway
 * in concrete blocks of mixed greys, buffs and terracottas, edged with terracotta along the kerbs.
 */

/** How many metres one tile of each surface texture covers. */
export const FLAG_TILE = 2.4;
export const SETT_TILE = 1.6;
export const BLOCK_TILE = 2;
export const BORDER_TILE = 1.2;

function surface(
  draw: (context: CanvasRenderingContext2D, size: number, random: () => number) => void,
  seed: number
): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  draw(canvas.getContext('2d')!, size, random);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Fine grain over a surface, so it isn't flat colour. */
function grain(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
  amount: number
) {
  for (let i = 0; i < size * size * 0.25; i++) {
    const shade = random() < 0.5 ? 0 : 255;
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${random() * amount})`;
    context.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
  }
}

/** Fills a cell with a colour, varied a little, leaving a joint around it. */
function cell(
  context: CanvasRenderingContext2D,
  [x, y, w, h]: [number, number, number, number],
  colour: string,
  random: () => number,
  joint: number
) {
  context.fillStyle = colour;
  context.fillRect(x + joint, y + joint, w - joint * 2, h - joint * 2);
  const tint = (random() - 0.5) * 0.12;
  context.fillStyle = tint > 0 ? `rgba(255,255,255,${tint})` : `rgba(0,0,0,${-tint})`;
  context.fillRect(x + joint, y + joint, w - joint * 2, h - joint * 2);
  // A highlight along one edge and a shadow along the other, as on slightly worn blocks.
  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.fillRect(x + joint, y + joint, w - joint * 2, 1);
  context.fillStyle = 'rgba(0, 0, 0, 0.1)';
  context.fillRect(x + joint, y + h - joint - 1, w - joint * 2, 1);
}

/** Grey concrete paving flags, laid in staggered courses. */
export function flagsTexture(): CanvasTexture {
  return surface((context, size, random) => {
    context.fillStyle = '#7f7d79';
    context.fillRect(0, 0, size, size);
    const greys = ['#a9a7a2', '#a2a09b', '#b1afa9', '#9b9994'];
    const rows = 4;
    const height = size / rows;
    for (let row = 0; row < rows; row++) {
      const width = size / 4;
      for (let x = row % 2 === 0 ? 0 : -width / 2; x < size; x += width) {
        cell(
          context,
          [x, row * height, width, height],
          greys[Math.floor(random() * greys.length)]!,
          random,
          1
        );
      }
    }
    grain(context, size, random, 0.08);
  }, 3);
}

/** Small grey granite setts in courses, some darker, some with a pinkish cast. */
export function settsTexture(): CanvasTexture {
  return surface((context, size, random) => {
    context.fillStyle = '#5f5d5a';
    context.fillRect(0, 0, size, size);
    const greys = ['#8f8d89', '#86847f', '#9a9893', '#7c7a76', '#95908a', '#8b8580'];
    const rows = 16;
    const height = size / rows;
    for (let row = 0; row < rows; row++) {
      let x = row % 2 === 0 ? 0 : -random() * 10;
      while (x < size) {
        const width = height * (1.2 + random() * 0.8);
        cell(
          context,
          [x, row * height, width, height],
          greys[Math.floor(random() * greys.length)]!,
          random,
          1.5
        );
        x += width;
      }
    }
    grain(context, size, random, 0.08);
  }, 11);
}

/** Long Acre's concrete block paving: rectangular blocks of mixed greys, buffs and terracottas. */
export function blocksTexture(): CanvasTexture {
  return surface((context, size, random) => {
    context.fillStyle = '#6d6a66';
    context.fillRect(0, 0, size, size);
    // Mostly greys and buffs, with salmon and terracotta blocks scattered through.
    const mix = [
      '#8e9094',
      '#a5a6a4',
      '#7c8189',
      '#9d9a95',
      '#b0a48f',
      '#b8a993',
      '#8a8e95',
      '#c0927a',
      '#a9705a',
      '#b7aa98',
    ];
    const rows = 10;
    const height = size / rows;
    const width = height * 2;
    for (let row = 0; row < rows; row++) {
      for (let x = row % 2 === 0 ? 0 : -width / 2; x < size; x += width) {
        cell(
          context,
          [x, row * height, width, height],
          mix[Math.floor(random() * mix.length)]!,
          random,
          1.5
        );
      }
    }
    grain(context, size, random, 0.07);
  }, 23);
}

/** The terracotta blocks edging the carriageway along the kerbs, laid crossways. */
export function borderTexture(): CanvasTexture {
  return surface((context, size, random) => {
    context.fillStyle = '#5e4a40';
    context.fillRect(0, 0, size, size);
    const reds = ['#a8634a', '#b46e52', '#9b5a43', '#bd7a5c'];
    const columns = 6;
    const width = size / columns;
    for (let column = 0; column < columns; column++) {
      for (let y = 0; y < size; y += size / 2) {
        cell(
          context,
          [column * width, y, width, size / 2],
          reds[Math.floor(random() * reds.length)]!,
          random,
          2
        );
      }
    }
    grain(context, size, random, 0.07);
  }, 31);
}

/** A copy of a surface texture that tiles across a surface `width` by `height` metres. */
export function tiled(texture: CanvasTexture, width: number, height: number, tile: number) {
  const copy = texture.clone();
  copy.repeat.set(width / tile, height / tile);
  return copy;
}

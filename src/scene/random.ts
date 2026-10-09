export function pick<T>(items: readonly T[], random: number): T {
  return items[Math.floor(random * items.length)]!;
}

/** A small deterministic random number generator, so each building keeps its looks. */
export function seeded(key: string): () => number {
  let state = 0;
  for (const char of key) state = (state * 31 + char.charCodeAt(0)) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

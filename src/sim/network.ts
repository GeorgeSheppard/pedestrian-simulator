export type Vec2 = [number, number];

/** The paths people can walk along: points joined by straight edges, in metres. */
export class WalkNetwork {
  readonly nodes: readonly Vec2[];
  private readonly neighbours: { node: number; length: number }[][];

  constructor(nodes: readonly Vec2[], edges: readonly (readonly [number, number])[]) {
    this.nodes = nodes;
    this.neighbours = nodes.map(() => []);
    for (const [a, b] of edges) {
      const length = distance(nodes[a]!, nodes[b]!);
      this.neighbours[a]!.push({ node: b, length });
      this.neighbours[b]!.push({ node: a, length });
    }
  }

  /** The shortest route between two nodes, as the node indices to walk through, or null. */
  route(from: number, to: number): number[] | null {
    const count = this.nodes.length;
    const best = new Array<number>(count).fill(Infinity);
    const previous = new Array<number>(count).fill(-1);
    const done = new Array<boolean>(count).fill(false);
    best[from] = 0;

    // The networks are tiny, so a linear scan beats maintaining a heap.
    for (;;) {
      let current = -1;
      for (let i = 0; i < count; i++) {
        if (!done[i] && best[i]! < Infinity && (current === -1 || best[i]! < best[current]!)) {
          current = i;
        }
      }
      if (current === -1) return null;
      if (current === to) break;
      done[current] = true;
      for (const { node, length } of this.neighbours[current]!) {
        const candidate = best[current]! + length;
        if (candidate < best[node]!) {
          best[node] = candidate;
          previous[node] = current;
        }
      }
    }

    const route = [to];
    while (route[0] !== from) route.unshift(previous[route[0]!]!);
    return route;
  }
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

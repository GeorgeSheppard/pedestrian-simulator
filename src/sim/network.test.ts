import { WalkNetwork } from './network';

describe('WalkNetwork', () => {
  // A square with one diagonal:
  //   0 — 1
  //   |   |
  //   3 — 2, plus a long way round from 0 to 2 through 4.
  const network = new WalkNetwork(
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [30, 30],
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 4],
      [4, 2],
    ]
  );

  it('finds the shortest route', () => {
    expect(network.route(0, 2)).toHaveLength(3);
    expect(network.route(0, 2)?.[0]).toBe(0);
    expect(network.route(0, 2)?.[2]).toBe(2);
  });

  it('routes from a node to itself', () => {
    expect(network.route(1, 1)).toEqual([1]);
  });

  it('returns null when there is no way through', () => {
    const split = new WalkNetwork(
      [
        [0, 0],
        [1, 0],
        [5, 5],
      ],
      [[0, 1]]
    );
    expect(split.route(0, 2)).toBeNull();
  });
});

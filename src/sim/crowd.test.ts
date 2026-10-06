import { Crowd } from './crowd';
import { WalkNetwork } from './network';

/** A deterministic stand-in for Math.random. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// A cross: four ways in at the ends, a station and a shop in the middle arms.
const network = new WalkNetwork(
  [
    [0, 0],
    [-20, 0],
    [20, 0],
    [0, -20],
    [0, 20],
    [5, 0],
    [0, 5],
  ],
  [
    [0, 1],
    [0, 5],
    [5, 2],
    [0, 3],
    [0, 6],
    [6, 4],
  ]
);

function crowd(population = 20) {
  return new Crowd({
    network,
    entrances: [1, 2, 3, 4],
    station: [5],
    shops: [6],
    population,
    random: seeded(42),
  });
}

describe('Crowd', () => {
  it('fills the scene up to its population', () => {
    const c = crowd();
    c.populate();
    expect(c.pedestrians).toHaveLength(20);
  });

  it('keeps everyone on or near the network as they walk', () => {
    const c = crowd();
    c.populate();
    for (let i = 0; i < 600; i++) c.update(1 / 30);
    for (const person of c.pedestrians) {
      const [x, z] = person.position;
      // Every path here runs along an axis, so people stay close to one of them.
      expect(Math.min(Math.abs(x), Math.abs(z))).toBeLessThan(2.5);
    }
  });

  it('lets people finish their walks and brings new ones in', () => {
    const c = crowd(10);
    c.populate();
    const firstIds = new Set(c.pedestrians.map((p) => p.id));
    for (let i = 0; i < 30 * 120; i++) c.update(1 / 30);
    expect(c.pedestrians.some((p) => !firstIds.has(p.id))).toBe(true);
    expect(c.pedestrians.length).toBeLessThanOrEqual(10 + 18);
  });
});

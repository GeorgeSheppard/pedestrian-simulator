import { WalkNetwork } from './network';
import { Simulation } from './simulation';

/** A deterministic stand-in for Math.random. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// A road along z = 0, 8 m wide, with a zebra crossing at x = 0, and pavements beyond the kerbs
// joined by the crossing.
const network = new WalkNetwork(
  [
    [-40, -6],
    [0, -6],
    [40, -6],
    [-40, 6],
    [0, 6],
    [40, 6],
  ],
  [
    [0, 1],
    [1, 2],
    [3, 4],
    [4, 5],
    [1, 4],
  ]
);

function simulation(population: number) {
  return new Simulation({
    crowd: { network, entrances: [0, 2, 3, 5], station: [], shops: [], population },
    road: {
      lane: [
        [60, 0],
        [-60, 0],
      ],
      halfWidth: 4,
      crossings: [[0, 0]],
    },
    vehicles: ['cab', 'car', 'van', 'car'],
    random: seeded(7),
  });
}

describe('Simulation', () => {
  it('never lets a vehicle drive through someone', () => {
    const sim = simulation(40);
    sim.populate();
    for (let i = 0; i < 180 * 30; i++) {
      sim.update(1 / 30);
      for (const vehicle of sim.traffic.vehicles) {
        if (!vehicle.active) continue;
        for (const person of sim.crowd.pedestrians) {
          if (person.leaving) continue;
          const { s, lateral } = sim.road.project(person.position);
          const close = Math.abs(lateral) < 1 && Math.abs(s - vehicle.s) < vehicle.length / 2;
          const hit = close && vehicle.speed > 0.5;
          expect(hit).toBe(false);
        }
      }
    }
  });

  it('keeps the traffic moving, and gets people across', () => {
    const sim = simulation(40);
    sim.populate();
    let moving = 0;
    let crossing = 0;
    for (let i = 0; i < 180 * 30; i++) {
      sim.update(1 / 30);
      if (sim.traffic.vehicles.some((v) => v.active && v.speed > 3)) moving++;
      if (sim.crowd.pedestrians.some((p) => Math.abs(p.position[1]) < 3)) crossing++;
    }
    expect(moving).toBeGreaterThan(180 * 30 * 0.3);
    expect(crossing).toBeGreaterThan(180 * 30 * 0.1);
  });
});

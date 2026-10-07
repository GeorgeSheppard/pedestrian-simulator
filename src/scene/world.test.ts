import { stationLayout } from '@/data/station';
import { insidePolygon } from './geometry';
import { createSimulation } from './world';

/** A deterministic stand-in for Math.random. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('the street outside Covent Garden station', () => {
  const sim = createSimulation(seeded(11));
  const footprint = stationLayout!.footprint;
  let hits = 0;
  let insideStation = 0;
  let trips = 0;
  const wasActive = sim.traffic.vehicles.map((v) => v.active);

  for (let i = 0; i < 240 * 30; i++) {
    sim.update(1 / 30);
    for (const vehicle of sim.traffic.vehicles) {
      if (!vehicle.active) continue;
      for (const person of sim.crowd.pedestrians) {
        if (person.leaving) continue;
        const { s, lateral } = sim.road.project(person.position);
        // Driving into someone; brushing past a car that's standing still doesn't count.
        const close = Math.abs(lateral) < 1 && Math.abs(s - vehicle.s) < vehicle.length / 2;
        if (close && vehicle.speed > 0.5) hits++;
      }
    }
    sim.traffic.vehicles.forEach((v, j) => {
      if (wasActive[j] && !v.active) trips++;
      wasActive[j] = v.active;
    });
    if (sim.crowd.pedestrians.some((p) => insidePolygon(p.position, footprint))) insideStation++;
  }

  it('never lets a vehicle drive through someone', () => {
    expect(hits).toBe(0);
  });

  it('keeps traffic flowing along Long Acre', () => {
    expect(trips).toBeGreaterThan(10);
  });

  it('has people walking into and out of the station', () => {
    expect(insideStation).toBeGreaterThan(240 * 30 * 0.5);
  });
});

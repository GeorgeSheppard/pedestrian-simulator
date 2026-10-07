import type { Vec2 } from '@/sim/network';
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
  const sim = createSimulation({ random: seeded(11) });
  const footprint = stationLayout!.footprint;
  let hits = 0;
  let insideStation = 0;
  let trips = 0;
  let shopping = 0;
  let groups = 0;
  let spread = 0;
  const wasActive = sim.traffic.vehicles.map((v) => v.active);
  // People seen behind the James Street gates, and those of them seen out on the street after.
  const exitFrontage = stationLayout!.frontages.find((f) => f.uses.includes('exit'))!;
  const behindExitGates = (point: Vec2) => {
    const out =
      (point[0] - exitFrontage.from[0]) * exitFrontage.normal[0] +
      (point[1] - exitFrontage.from[1]) * exitFrontage.normal[1];
    return insidePolygon(point, footprint) && out > -3;
  };
  const cameUp = new Set<object>();
  const cameOut = new Set<object>();

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
    for (const p of sim.crowd.pedestrians) {
      if (behindExitGates(p.position)) cameUp.add(p);
      else if (cameUp.has(p) && !insidePolygon(p.position, footprint)) cameOut.add(p);
    }
    if (sim.crowd.pedestrians.some((p) => p.indoors > 0)) shopping++;
    const companions = sim.crowd.pedestrians.filter(
      (p) => p.leader && !p.leaving && p.indoors <= 0
    );
    if (companions.length > 0) groups++;
    for (const p of companions) {
      const leader = p.leader!;
      if (Math.hypot(p.position[0] - leader.position[0], p.position[1] - leader.position[1]) > 4) {
        spread++;
      }
    }
  }

  it('never lets a vehicle drive through someone', () => {
    expect(hits).toBe(0);
  });

  it('keeps traffic flowing along Long Acre', () => {
    // Jammed traffic would manage one or two; flowing traffic, between the crowds at the zebra,
    // gets a vehicle through every half minute or so.
    expect(trips).toBeGreaterThan(6);
  });

  it('has people going into the shops', () => {
    expect(shopping).toBeGreaterThan(240 * 30 * 0.9);
  });

  it('has groups walking around together', () => {
    expect(groups).toBeGreaterThan(240 * 30 * 0.9);
    // Rarely more than a few metres from whoever's leading them.
    expect(spread).toBeLessThan(240 * 30);
  });

  it('thins the crowd out when it is made smaller, and fills it when made bigger', () => {
    sim.population = 40;
    for (let i = 0; i < 60 * 30; i++) sim.update(1 / 30);
    expect(sim.crowd.pedestrians.length).toBeLessThan(55);
    sim.population = 200;
    for (let i = 0; i < 90 * 30; i++) sim.update(1 / 30);
    expect(sim.crowd.pedestrians.length).toBeGreaterThan(170);
  });

  it('has people walking into and out of the station', () => {
    expect(insideStation).toBeGreaterThan(240 * 30 * 0.5);
  });

  it('has people off the trains coming out through the James Street gates', () => {
    // A lift-load every 30 to 60 s, most of them out this way.
    expect(exitFrontage.uses.every((use) => use === 'exit')).toBe(true);
    expect(cameOut.size).toBeGreaterThan(40);
  });
});

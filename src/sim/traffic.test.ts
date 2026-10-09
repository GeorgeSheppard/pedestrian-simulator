import { Polyline } from './path';
import { type Hazards, Traffic } from './traffic';

const lane = new Polyline([
  [0, 0],
  [200, 0],
]);

function traffic(slots = 3) {
  return new Traffic({
    lane,
    slots: Array.from({ length: slots }, () => 'car' as const),
    crossings: [100],
    random: () => 0.5,
  });
}

const clear: Hazards = { inLane: [], onCrossing: [false], atKerb: [false] };

function run(t: Traffic, seconds: number, hazards = clear) {
  for (let i = 0; i < seconds * 30; i++) t.update(1 / 30, hazards);
}

describe('Traffic', () => {
  it('sends vehicles along the road and off the far end', () => {
    const t = traffic(1);
    run(t, 2);
    const [car] = t.vehicles;
    expect(car!.active).toBe(true);
    expect(car!.s).toBeGreaterThan(5);
    run(t, 60);
    // It's been round: gone off the end, and come back on at the start.
    expect(car!.s).toBeLessThan(200);
  });

  it('stops before a busy crossing, and goes on once it clears', () => {
    const t = traffic(1);
    run(t, 2);
    const busy: Hazards = { inLane: [], onCrossing: [true], atKerb: [false] };
    run(t, 30, busy);
    const [car] = t.vehicles;
    expect(car!.speed).toBeLessThan(0.1);
    expect(car!.s + car!.length / 2).toBeLessThan(100 - 3);
    run(t, 5);
    expect(car!.speed).toBeGreaterThan(1);
  });

  it('waits for people at the kerb, but only for so long', () => {
    const t = traffic(1);
    run(t, 2);
    const waiting: Hazards = { inLane: [], onCrossing: [false], atKerb: [true] };
    run(t, 6);
    run(t, 6, waiting);
    const [car] = t.vehicles;
    expect(car!.speed).toBeLessThan(0.1);
    run(t, 12, waiting);
    expect(car!.s).toBeGreaterThan(100);
  });

  it('stops for someone in the road ahead', () => {
    const t = traffic(1);
    run(t, 2);
    run(t, 30, { inLane: [60], onCrossing: [false], atKerb: [false] });
    const [car] = t.vehicles;
    expect(car!.speed).toBeLessThan(0.1);
    expect(car!.s + car!.length / 2).toBeLessThan(60);
  });

  it('keeps a gap behind the vehicle in front', () => {
    const t = traffic(3);
    for (let i = 0; i < 60 * 30; i++) {
      t.update(1 / 30, { inLane: [], onCrossing: [true], atKerb: [false] });
      const active = t.vehicles.filter((v) => v.active).sort((a, b) => b.s - a.s);
      for (let j = 1; j < active.length; j++) {
        const [ahead, behind] = [active[j - 1]!, active[j]!];
        expect(ahead.s - ahead.length / 2 - (behind.s + behind.length / 2)).toBeGreaterThan(0.5);
      }
    }
  });
});

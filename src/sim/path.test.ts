import { Polyline } from './path';

describe('Polyline', () => {
  // An L: 10 m east, then 10 m south.
  const path = new Polyline([
    [0, 0],
    [10, 0],
    [10, 10],
  ]);

  it('measures its length', () => {
    expect(path.length).toBe(20);
  });

  it('finds points along it, with the way it runs', () => {
    expect(path.at(5).position).toEqual([5, 0]);
    expect(path.at(15).position).toEqual([10, 5]);
    expect(path.at(15).heading).toBeCloseTo(Math.PI / 2);
  });

  it('carries straight on past its ends', () => {
    expect(path.at(-2).position).toEqual([-2, 0]);
  });

  it('projects points on to it, right of travel being positive', () => {
    expect(path.project([4, 2])).toEqual({ s: 4, lateral: 2 });
    expect(path.project([4, -3])).toEqual({ s: 4, lateral: -3 });
    expect(path.project([13, 6]).s).toBeCloseTo(16);
  });
});

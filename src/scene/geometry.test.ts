import { convexHull, convexity, polygonArea } from './geometry';

describe('geometry', () => {
  const square: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];
  const lShape: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 2],
    [2, 2],
    [2, 4],
    [0, 4],
  ];

  it('measures areas', () => {
    expect(polygonArea(square)).toBe(16);
    expect(polygonArea(lShape)).toBe(12);
  });

  it('wraps a hull round the outermost points', () => {
    expect(polygonArea(convexHull(lShape))).toBe(14);
  });

  it('tells convex shapes from notched ones', () => {
    expect(convexity(square)).toBe(1);
    expect(convexity(lShape)).toBeCloseTo(12 / 14);
  });
});

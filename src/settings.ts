import type { Weather } from '@/weather/weather';

/** The most people and vehicles the controls go up to. */
export const PEOPLE_RANGE: [number, number] = [0, 400];
export const TRAFFIC_RANGE: [number, number] = [0, 12];

export interface Settings {
  weather: Weather;
  /** How many people walk around. */
  people: number;
  /** How many vehicles may be on Long Acre at once. */
  traffic: number;
}

/** A whole number from the URL, such as `?people=200`, kept within a range. */
export function numberFromUrl(
  name: string,
  fallback: number,
  [min, max]: [number, number]
): number {
  const text = new URLSearchParams(window.location.search).get(name);
  const value = text ? Number(text) : NaN;
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.min(max, Math.max(min, value)));
}

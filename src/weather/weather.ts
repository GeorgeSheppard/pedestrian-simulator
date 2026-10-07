/** The weather the scene can show, from a bright day to a grey London drizzle. */
export type Weather = 'sunny' | 'cloudy' | 'rain';

export const WEATHERS: Weather[] = ['sunny', 'cloudy', 'rain'];

export interface WeatherLook {
  label: string;
  /** The sky and haze behind the model. */
  background: string;
  fog: [number, number];
  sun: { colour: string; intensity: number };
  /** The soft light from the whole sky. */
  sky: { colour: string; intensity: number };
  environment: number;
  clouds: { count: number; colour: string; scale: number };
  rain: boolean;
}

export const LOOKS: Record<Weather, WeatherLook> = {
  sunny: {
    label: 'Sunny',
    background: '#e9edf0',
    fog: [380, 900],
    sun: { colour: '#fff1dc', intensity: 2.5 },
    sky: { colour: '#f4f7ff', intensity: 1 },
    environment: 0.6,
    clouds: { count: 5, colour: '#d9dee4', scale: 0.8 },
    rain: false,
  },
  cloudy: {
    label: 'Cloudy',
    background: '#dfe4e8',
    fog: [330, 820],
    sun: { colour: '#f2f3f4', intensity: 1.2 },
    sky: { colour: '#eef1f5', intensity: 1.5 },
    environment: 0.75,
    clouds: { count: 12, colour: '#d3d8de', scale: 1 },
    rain: false,
  },
  rain: {
    label: 'Rain',
    background: '#c9cfd5',
    fog: [260, 700],
    sun: { colour: '#e2e7ec', intensity: 0.55 },
    sky: { colour: '#dbe1e8', intensity: 1.35 },
    environment: 0.55,
    clouds: { count: 12, colour: '#aeb5be', scale: 1.15 },
    rain: true,
  },
};

/** The weather asked for in the URL as `?weather=rain`, or a sunny day. */
export function weatherFromUrl(): Weather {
  const asked = new URLSearchParams(window.location.search).get('weather');
  return WEATHERS.find((w) => w === asked) ?? 'sunny';
}

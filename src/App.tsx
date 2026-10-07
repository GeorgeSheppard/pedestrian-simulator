import { useState } from 'react';
import { area } from '@/data/area';
import { Scene } from '@/scene/Scene';
import { LOOKS, WEATHERS, type Weather, weatherFromUrl } from '@/weather/weather';
import styles from './App.module.css';

export function App() {
  const [weather, setWeather] = useState<Weather>(weatherFromUrl);

  return (
    <>
      <Scene weather={weather} />
      <div className={styles.weather} role="radiogroup" aria-label="Weather">
        {WEATHERS.map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={w === weather}
            className={styles.option}
            onClick={() => setWeather(w)}
          >
            <WeatherIcon weather={w} />
            {LOOKS[w].label}
          </button>
        ))}
      </div>
      <a className={styles.attribution} href="https://www.openstreetmap.org/copyright">
        {area.attribution}
      </a>
    </>
  );
}

function WeatherIcon({ weather }: { weather: Weather }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className={styles.icon}>
      {weather === 'sunny' ? (
        <>
          <circle cx="8" cy="8" r="3.2" fill="currentColor" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <line
              key={angle}
              x1="8"
              y1="1.2"
              x2="8"
              y2="3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              transform={`rotate(${angle} 8 8)`}
            />
          ))}
        </>
      ) : (
        <>
          <path
            d="M4.5 11.5h7a2.6 2.6 0 0 0 .3-5.2A3.6 3.6 0 0 0 4.9 6a2.8 2.8 0 0 0-.4 5.5z"
            fill="currentColor"
          />
          {weather === 'rain' &&
            [5, 8, 11].map((x) => (
              <line
                key={x}
                x1={x}
                y1="13"
                x2={x - 0.8}
                y2="15"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            ))}
        </>
      )}
    </svg>
  );
}

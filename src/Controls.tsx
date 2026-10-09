import { useId, useState } from 'react';
import { PEOPLE_RANGE, type Settings, TRAFFIC_RANGE } from '@/settings';
import { LOOKS, WEATHERS, type Weather } from '@/weather/weather';
import styles from './Controls.module.css';

function trafficLabel(count: number): string {
  if (count === 0) return 'None';
  if (count <= 3) return 'Light';
  if (count <= 7) return 'Normal';
  return 'Busy';
}

/**
 * The panel in the bottom left: the weather, and sliders for how busy the street is with people and
 * with traffic. It folds away to a small button.
 */
export function Controls({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const [open, setOpen] = useState(true);
  const id = useId();
  const set = (change: Partial<Settings>) => onChange({ ...settings, ...change });

  if (!open) {
    return (
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={false}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        <SlidersIcon />
        Controls
      </button>
    );
  }

  return (
    <section id={id} className={styles.panel} aria-label="Controls">
      <div className={styles.header}>
        <span className={styles.title}>Controls</span>
        <button
          type="button"
          className={styles.close}
          aria-label="Hide controls"
          aria-expanded
          onClick={() => setOpen(false)}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>

      <div className={styles.segmented} role="radiogroup" aria-label="Weather">
        {WEATHERS.map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={w === settings.weather}
            className={styles.option}
            onClick={() => set({ weather: w })}
          >
            <WeatherIcon weather={w} />
            {LOOKS[w].label}
          </button>
        ))}
      </div>

      <Slider
        label="People"
        value={settings.people}
        range={PEOPLE_RANGE}
        step={10}
        display={String(settings.people)}
        onChange={(people) => set({ people })}
      />
      <Slider
        label="Traffic"
        value={settings.traffic}
        range={TRAFFIC_RANGE}
        step={1}
        display={trafficLabel(settings.traffic)}
        onChange={(traffic) => set({ traffic })}
      />
    </section>
  );
}

function Slider({
  label,
  value,
  range,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  range: [number, number];
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className={styles.slider}>
      <div className={styles.sliderLabel}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input
        id={id}
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <line x1="2" y1="5" x2="14" y2="5" />
        <line x1="2" y1="11" x2="14" y2="11" />
      </g>
      <circle cx="10" cy="5" r="2" fill="currentColor" />
      <circle cx="6" cy="11" r="2" fill="currentColor" />
    </svg>
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

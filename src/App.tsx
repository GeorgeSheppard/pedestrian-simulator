import { useState } from 'react';
import { area } from '@/data/area';
import { Scene } from '@/scene/Scene';
import { POPULATION, USUAL_TRAFFIC } from '@/scene/world';
import { weatherFromUrl } from '@/weather/weather';
import { numberFromUrl, PEOPLE_RANGE, type Settings, TRAFFIC_RANGE } from '@/settings';
import { Controls } from './Controls';
import styles from './App.module.css';

export function App() {
  const [settings, setSettings] = useState<Settings>(() => ({
    weather: weatherFromUrl(),
    people: numberFromUrl('people', POPULATION, PEOPLE_RANGE),
    traffic: numberFromUrl('traffic', USUAL_TRAFFIC, TRAFFIC_RANGE),
  }));

  return (
    <>
      <Scene weather={settings.weather} people={settings.people} traffic={settings.traffic} />
      <Controls settings={settings} onChange={setSettings} />
      <a className={styles.attribution} href="https://www.openstreetmap.org/copyright">
        {area.attribution}
      </a>
    </>
  );
}

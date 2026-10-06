import { area } from '@/data/area';
import { Scene } from '@/scene/Scene';
import styles from './App.module.css';

export function App() {
  return (
    <>
      <Scene />
      <a className={styles.attribution} href="https://www.openstreetmap.org/copyright">
        {area.attribution}
      </a>
    </>
  );
}

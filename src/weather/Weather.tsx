import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  IcosahedronGeometry,
  type InstancedMesh,
  LineBasicMaterial,
  Matrix4,
  MeshStandardMaterial,
} from 'three';
import { seeded } from '@/scene/random';
import type { WeatherLook } from './weather';

/** Where the clouds drift: a box round the model, wider than it, so they drift in and out. */
const CLOUD_RANGE: [number, number] = [120, 95];
/** The wind, in metres per second, from the west-south-west. */
const WIND: [number, number] = [2.2, 0.6];
const RAIN_RANGE: [number, number] = [55, 45];
const RAIN_HEIGHT = 45;
const RAIN_DROPS = 3500;
const RAIN_SPEED = 26;
const DROP_LENGTH = 1.4;

/** Puffy, faceted clouds drifting over the model on the wind, casting soft moving shadows. */
export function Clouds({ look }: { look: WeatherLook }) {
  const { count, colour, scale } = look.clouds;
  const geometry = useMemo(() => new IcosahedronGeometry(1, 1), []);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: colour,
        roughness: 1,
        flatShading: true,
        transparent: true,
        opacity: 0.94,
      }),
    [colour]
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const clouds = useMemo(() => {
    const random = seeded(`clouds ${count}`);
    return Array.from({ length: count }, () => {
      const size = (5 + random() * 5) * scale;
      // A flat-bottomed heap of puffs, biggest in the middle.
      const puffs = Array.from({ length: 6 + Math.floor(random() * 4) }, (_, i) => {
        const angle = random() * Math.PI * 2;
        const spread = i === 0 ? 0 : size * (0.5 + random() * 0.6);
        const radius = size * (i === 0 ? 0.8 : 0.4 + random() * 0.35);
        return {
          position: [
            Math.cos(angle) * spread,
            radius * 0.35 + random() * size * 0.2,
            Math.sin(angle) * spread * 0.6,
          ] as [number, number, number],
          radius,
        };
      });
      return {
        start: [
          (random() * 2 - 1) * CLOUD_RANGE[0],
          42 + random() * 18,
          (random() * 2 - 1) * CLOUD_RANGE[1],
        ] as [number, number, number],
        puffs,
      };
    });
  }, [count, scale]);

  // Every puff of every cloud, drawn in one go.
  const puffCount = useMemo(() => clouds.reduce((n, cloud) => n + cloud.puffs.length, 0), [clouds]);
  const mesh = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => new Matrix4(), []);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.getElapsedTime();
    let i = 0;
    for (const cloud of clouds) {
      const x = wrap(cloud.start[0] + WIND[0] * t, CLOUD_RANGE[0]);
      const z = wrap(cloud.start[2] + WIND[1] * t, CLOUD_RANGE[1]);
      for (const { position, radius } of cloud.puffs) {
        matrix.makeScale(radius, radius * 0.7, radius);
        matrix.setPosition(x + position[0], cloud.start[1] + position[1], z + position[2]);
        mesh.current.setMatrixAt(i++, matrix);
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      // A new one when the number of puffs changes with the weather.
      key={puffCount}
      ref={mesh}
      args={[geometry, material, puffCount]}
      castShadow
      // They drift and wrap round, so the bounds worked out when they first appear won't do.
      frustumCulled={false}
    />
  );
}

/** Rain: thin streaks falling over the model, slanting a little with the wind. */
export function Rain() {
  const { geometry, drops } = useMemo(() => {
    const random = seeded('rain');
    const drops = Array.from({ length: RAIN_DROPS }, () => ({
      x: (random() * 2 - 1) * RAIN_RANGE[0],
      z: (random() * 2 - 1) * RAIN_RANGE[1],
      offset: random() * RAIN_HEIGHT,
      speed: RAIN_SPEED * (0.85 + random() * 0.3),
    }));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(RAIN_DROPS * 6), 3));
    return { geometry, drops };
  }, []);
  const material = useMemo(
    () => new LineBasicMaterial({ color: '#eef3f8', transparent: true, opacity: 0.8 }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  const slant: [number, number] = [WIND[0] / RAIN_SPEED, WIND[1] / RAIN_SPEED];

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const positions = geometry.getAttribute('position') as BufferAttribute;
    drops.forEach((drop, i) => {
      const y = RAIN_HEIGHT - ((drop.offset + drop.speed * t) % RAIN_HEIGHT);
      const top = y + DROP_LENGTH;
      positions.setXYZ(i * 2, drop.x - slant[0] * y, y, drop.z - slant[1] * y);
      positions.setXYZ(i * 2 + 1, drop.x - slant[0] * top, top, drop.z - slant[1] * top);
    });
    positions.needsUpdate = true;
  });

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}

/** Keeps a coordinate within ±range, wrapping round from one side to the other. */
function wrap(value: number, range: number): number {
  return ((((value + range) % (range * 2)) + range * 2) % (range * 2)) - range;
}

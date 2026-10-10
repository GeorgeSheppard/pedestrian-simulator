import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, MapControls } from '@react-three/drei';
import { MOUSE, NoToneMapping, TOUCH, Vector3 } from 'three';
import { Buildings } from './Buildings';
import { Effects } from './Effects';
import { Ground } from './Ground';
import { Pedestrians } from './Pedestrians';
import { Props } from './Props';
import { LivingWall } from './LivingWall';
import { ShopDoors } from './ShopDoors';
import { Station } from './Station';
import { Traffic } from './Vehicles';
import { createSimulation } from './world';
import type { Simulation } from '@/sim/simulation';
import { LOOKS, type Weather } from '@/weather/weather';
import { Clouds, Rain } from '@/weather/Weather';

/** How far the camera can wander from the centre, so the plinth always stays in view. */
const PAN_LIMIT = 30;
/** The junction outside the station, where the camera looks to begin with. */
const FOCUS: [number, number, number] = [6, 0, -4];
/** The way the camera looks at the junction: from the east, high up, down Long Acre. */
const VIEW_DIRECTION = new Vector3(0.68, 0.71, -0.18).normalize();
/** How far away the camera starts on a landscape screen, in metres. */
const VIEW_DISTANCE = 255;

export function Scene({
  weather,
  people,
  traffic,
}: {
  weather: Weather;
  /** How many people to have walking around. */
  people: number;
  /** How many vehicles can be on the road at once. */
  traffic: number;
}) {
  const look = LOOKS[weather];
  // Made once, starting with the crowd and traffic asked for; changes after that it eases into.
  const [simulation] = useState(() => createSimulation({ people, traffic }));
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      // A long lens from high up flattens perspective, the first trick in making it look small.
      camera={{ position: startingPosition(1), fov: 20, near: 10, far: 1000 }}
      // Tone mapping happens in the effect stack instead, after the blur.
      gl={{ toneMapping: NoToneMapping }}
    >
      <color attach="background" args={[look.background]} />
      <fog attach="fog" args={[look.background, ...look.fog]} />

      {/* Soft studio light all round, for the gentle highlights on painted and plastic surfaces. */}
      <Environment resolution={256} environmentIntensity={look.environment}>
        <Lightformer
          form="rect"
          intensity={3}
          position={[0, 40, 0]}
          rotation-x={Math.PI / 2}
          scale={[80, 80, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.5}
          position={[-60, 20, -40]}
          rotation-y={Math.PI / 3}
          scale={[60, 20, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1}
          color="#ffe2bf"
          position={[60, 15, 40]}
          rotation-y={-Math.PI / 1.5}
          scale={[60, 20, 1]}
        />
      </Environment>
      <hemisphereLight args={[look.sky.colour, '#d9cfbf', look.sky.intensity]} />
      {/* A low-ish sun from the east, so streets get long shadows across them: warm and strong on
          a sunny day, pale and weak through cloud. */}
      <directionalLight
        position={[120, 110, -20]}
        color={look.sun.colour}
        intensity={look.sun.intensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />

      <Ground background={look.background} />
      <Buildings />
      <ShopDoors />
      <Props />
      <Clouds look={look} />
      {look.rain && <Rain />}
      <Simulate simulation={simulation} people={people} traffic={traffic} />
      <Pedestrians simulation={simulation} />
      <Traffic simulation={simulation} />
      <Station />
      <LivingWall />

      {/* One finger, or dragging, turns the model round the middle of the view; two fingers, or
          right-dragging, slide it about, keeping to the ground. */}
      <MapControls
        makeDefault
        target={FOCUS}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
        minPolarAngle={0.45}
        maxPolarAngle={1.2}
        minDistance={22}
        maxDistance={560}
        onChange={(event) => {
          const target = (event?.target as { target?: Vector3 } | undefined)?.target;
          if (!target) return;
          target.x = clampPan(target.x);
          target.z = clampPan(target.z);
          target.y = 0;
        }}
      />

      <KeyboardPan />

      {/* The second trick, with the rest of the finishing passes: a shallow depth of field. */}
      <Effects />
      <FitToScreen />
    </Canvas>
  );
}

function clampPan(value: number): number {
  return Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, value));
}

/** Which way each key moves the camera: [right, forward]. */
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
/**
 * How fast the keys move the camera, as a share of its distance from what it's looking at each
 * second, so it feels the same zoomed in or out.
 */
const KEY_SPEED = 0.6;

/**
 * Moves the camera over the ground with WASD or the arrow keys, forward being the way it's facing,
 * keeping the same angle and height.
 */
function KeyboardPan() {
  const held = useRef(new Set<string>());

  useEffect(() => {
    const keys = held.current;
    const down = (event: KeyboardEvent) => {
      if (!(event.code in KEYS) || event.metaKey || event.ctrlKey || event.altKey) return;
      // Leave the arrow keys to the sliders when one has focus.
      const inControl =
        event.target instanceof HTMLElement && event.target.closest('input, button');
      if (inControl && event.code.startsWith('Arrow')) return;
      keys.add(event.code);
      if (event.code.startsWith('Arrow')) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => keys.delete(event.code);
    const clear = () => keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const shift = useMemo(() => new Vector3(), []);
  useFrame((state, delta) => {
    const { camera } = state;
    const controls = state.controls as { target: Vector3; update: () => void } | null;
    if (!controls || held.current.size === 0) return;
    let [x, y] = [0, 0];
    for (const code of held.current) {
      x += KEYS[code]![0];
      y += KEYS[code]![1];
    }
    if (x === 0 && y === 0) return;
    // Along the ground, the way the camera's looking, and across it.
    camera.getWorldDirection(forward).setY(0).normalize();
    right.set(-forward.z, 0, forward.x);
    const distance = camera.position.distanceTo(controls.target);
    const step = (KEY_SPEED * distance * Math.min(delta, 0.1)) / Math.hypot(x, y);
    const target = controls.target;
    const toX = clampPan(target.x + (right.x * x + forward.x * y) * step);
    const toZ = clampPan(target.z + (right.z * x + forward.z * y) * step);
    camera.position.add(shift.set(toX - target.x, 0, toZ - target.z));
    target.set(toX, 0, toZ);
    controls.update();
  });

  return null;
}

function startingPosition(aspect: number): [number, number, number] {
  // On a narrow, portrait screen, step back so the whole plinth still fits across it.
  const distance = VIEW_DISTANCE / Math.min(1, aspect * 1.05);
  const position = VIEW_DIRECTION.clone()
    .multiplyScalar(distance)
    .add(new Vector3(...FOCUS));
  return [position.x, position.y, position.z];
}

/**
 * Frames the plinth for the screen's shape when the scene first loads, or sets up the view given
 * in the URL as `?view=x,y,z,targetX,targetY,targetZ`, for sharing a particular angle.
 */
function FitToScreen() {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const controls = useThree((state) => state.controls) as {
    target: Vector3;
    update: () => void;
  } | null;
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || !Number.isFinite(aspect) || !controls) return;
    fitted.current = true;
    const view = viewFromUrl();
    if (view) {
      camera.position.set(...view.position);
      controls.target.set(...view.target);
    } else {
      camera.position.set(...startingPosition(aspect));
    }
    controls.update();
  }, [camera, aspect, controls]);

  return null;
}

function viewFromUrl() {
  const numbers = new URLSearchParams(window.location.search).get('view')?.split(',').map(Number);
  if (!numbers || numbers.length !== 6 || numbers.some((n) => !Number.isFinite(n))) return null;
  const [x, y, z, tx, ty, tz] = numbers as [number, number, number, number, number, number];
  return {
    position: [x, y, z] as [number, number, number],
    target: [tx, ty, tz] as [number, number, number],
  };
}

/**
 * Steps the people and traffic on each frame, before anything is drawn, with as many of each as the
 * controls ask for: the crowd and the traffic thin out or fill up to them over the next while.
 */
function Simulate({
  simulation,
  people,
  traffic,
}: {
  simulation: Simulation;
  people: number;
  traffic: number;
}) {
  useFrame((_, delta) => {
    simulation.resize(people, traffic);
    // Don't try to catch up after the tab has been in the background.
    simulation.update(Math.min(delta, 0.1));
  }, -1);
  return null;
}

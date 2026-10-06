import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, MapControls } from '@react-three/drei';
import { NoToneMapping, Vector3 } from 'three';
import { area } from '@/data/area';
import { Buildings } from './Buildings';
import { Effects } from './Effects';
import { Ground } from './Ground';
import { Pedestrians } from './Pedestrians';
import { Props } from './Props';
import { LivingWall } from './LivingWall';
import { Station } from './Station';
import { colours } from './palette';

const [WIDTH, DEPTH] = area.size;
/** How far the camera can wander from the centre, so the plinth always stays in view. */
const PAN_LIMIT = 30;
/** The junction outside the station, where the camera looks to begin with. */
const FOCUS: [number, number, number] = [6, 0, -4];
/** The way the camera looks at the junction: from the east, high up, down Long Acre. */
const VIEW_DIRECTION = new Vector3(0.68, 0.71, -0.18).normalize();
/** How far away the camera starts on a landscape screen, in metres. */
const VIEW_DISTANCE = 255;

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      // A long lens from high up flattens perspective, the first trick in making it look small.
      camera={{ position: startingPosition(1), fov: 20, near: 10, far: 1000 }}
      // Tone mapping happens in the effect stack instead, after the blur.
      gl={{ toneMapping: NoToneMapping }}
    >
      <color attach="background" args={[colours.background]} />
      <fog attach="fog" args={[colours.background, 380, 900]} />

      {/* Soft studio light all round, for the gentle highlights on painted and plastic surfaces. */}
      <Environment resolution={256} environmentIntensity={0.6}>
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
      <hemisphereLight args={['#f4f7ff', '#d9cfbf', 1]} />
      {/* A warm, low-ish sun from the east, so streets get long shadows across them. */}
      <directionalLight
        position={[120, 110, -20]}
        color="#fff1dc"
        intensity={2.5}
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

      <Ground />
      <Buildings />
      <Props />
      <Pedestrians />
      <Station />
      <LivingWall />

      {/* A soft shadow under the plinth, as if it were standing on a table. */}
      <ContactShadows
        position={[0, -3.05, 0]}
        scale={[WIDTH * 1.5, DEPTH * 1.5]}
        far={12}
        blur={3}
        opacity={0.35}
      />

      <MapControls
        makeDefault
        target={FOCUS}
        minPolarAngle={0.45}
        maxPolarAngle={1.2}
        minDistance={22}
        maxDistance={560}
        onChange={(event) => {
          const target = (event?.target as { target?: Vector3 } | undefined)?.target;
          if (!target) return;
          target.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, target.x));
          target.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, target.z));
          target.y = 0;
        }}
      />

      {/* The second trick, with the rest of the finishing passes: a shallow depth of field. */}
      <Effects />
      <FitToScreen />
    </Canvas>
  );
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

import { Canvas } from '@react-three/fiber';
import { ContactShadows, MapControls, RoundedBox } from '@react-three/drei';

const BACKGROUND = '#eef1f4';

// Placeholder blocks standing in for buildings until the Covent Garden geometry lands.
const BLOCKS: { position: [number, number]; size: [number, number, number]; color: string }[] = [
  { position: [-3, -2], size: [3, 2, 2], color: '#c96a4b' },
  { position: [1.5, -2.5], size: [2.5, 3, 2], color: '#e6dccb' },
  { position: [-2.5, 2], size: [2, 1.5, 3], color: '#2f4f8f' },
  { position: [2.5, 2], size: [3, 2.5, 2.5], color: '#d9b44a' },
];

export function Scene() {
  return (
    <Canvas shadows camera={{ position: [18, 16, 18], fov: 25 }} dpr={[1, 2]}>
      <color attach="background" args={[BACKGROUND]} />
      <fog attach="fog" args={[BACKGROUND, 25, 60]} />

      <hemisphereLight args={['#ffffff', '#b8c0c8', 1.2]} />
      <directionalLight position={[8, 12, 5]} intensity={1.5} castShadow />

      {/* The plinth the miniature sits on. */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[12, 1, 10]} />
        <meshStandardMaterial color="#d6d3cc" roughness={0.8} />
      </mesh>

      {BLOCKS.map(({ position: [x, z], size, color }) => (
        <RoundedBox
          key={`${x},${z}`}
          args={size}
          radius={0.08}
          position={[x, size[1] / 2, z]}
          castShadow
        >
          <meshStandardMaterial color={color} roughness={0.6} />
        </RoundedBox>
      ))}

      <ContactShadows position={[0, 0.01, 0]} scale={14} opacity={0.4} blur={2} far={4} />

      <MapControls
        makeDefault
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 3}
        minDistance={12}
        maxDistance={45}
      />
    </Canvas>
  );
}

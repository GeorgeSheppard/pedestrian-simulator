import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  HueSaturation,
  N8AO,
  ToneMapping,
} from '@react-three/postprocessing';
import { type DepthOfFieldEffect, ToneMappingMode } from 'postprocessing';
import type { Vector3 } from 'three';

/**
 * The finishing passes that sell the miniature: ambient occlusion in the corners, a glow on the
 * lamps, and above all a shallow depth of field, kept focused on whatever the camera is looking at.
 */
export function Effects() {
  const depthOfField = useRef<DepthOfFieldEffect>(null);
  const controls = useThree((state) => state.controls) as { target?: Vector3 } | null;

  useFrame(() => {
    if (depthOfField.current?.target && controls?.target) {
      depthOfField.current.target.copy(controls.target);
    }
  });

  return (
    <EffectComposer multisampling={4}>
      <N8AO halfRes aoRadius={2.5} intensity={3} distanceFalloff={1} />
      <Bloom mipmapBlur luminanceThreshold={1} intensity={0.9} />
      <DepthOfField ref={depthOfField} target={[0, 0, 0]} worldFocusRange={40} bokehScale={3} />
      <HueSaturation saturation={0.12} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}

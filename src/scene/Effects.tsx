import { useEffect, useMemo, useRef } from 'react';
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
import { area } from '@/data/area';
import { EdgeBlurEffect } from './EdgeBlur';

/**
 * The finishing passes that sell the miniature: ambient occlusion in the corners, a glow on the
 * lamps, and above all the blur. A shallow depth of field stays focused on whatever the camera
 * is looking at, so the blur shifts as you move around; on top of that, the edges of the slab,
 * where people walk in from, are always blurred.
 */
export function Effects() {
  const depthOfField = useRef<DepthOfFieldEffect>(null);
  const controls = useThree((state) => state.controls) as { target?: Vector3 } | null;
  const camera = useThree((state) => state.camera);
  const edgeBlur = useMemo(
    () =>
      new EdgeBlurEffect(camera, {
        halfSize: [area.size[0] / 2, area.size[1] / 2],
        sharpFrom: 18,
        blurredBy: 2,
        radius: 9,
      }),
    [camera]
  );
  useEffect(() => () => edgeBlur.dispose(), [edgeBlur]);

  useFrame(() => {
    if (depthOfField.current?.target && controls?.target) {
      depthOfField.current.target.copy(controls.target);
    }
  });

  return (
    <EffectComposer multisampling={4}>
      <N8AO halfRes aoRadius={2.5} intensity={3} distanceFalloff={1} />
      <Bloom mipmapBlur luminanceThreshold={1} intensity={0.9} />
      <DepthOfField ref={depthOfField} target={[0, 0, 0]} worldFocusRange={26} bokehScale={4.5} />
      <primitive object={edgeBlur} />
      <HueSaturation saturation={0.12} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}

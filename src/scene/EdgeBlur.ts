import { Effect, EffectAttribute } from 'postprocessing';
import { type Camera, Matrix4, Uniform, Vector2 } from 'three';

/**
 * Blurs the scene more the nearer it is to the edges of the slab, wherever the camera is, so the
 * streets people walk in from always melt away, as in a tilt-shift photo of a model. Each pixel's
 * position on the ground is worked out from the depth buffer, so the blur follows the slab, not
 * the screen.
 */
const fragmentShader = /* glsl */ `
  uniform mat4 projectionInverse;
  uniform mat4 viewInverse;
  uniform vec2 halfSize;
  uniform float sharpFrom;
  uniform float blurredBy;
  uniform float radius;

  vec3 worldPosition(const in vec2 uv, const in float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = projectionInverse * clip;
    view /= view.w;
    return (viewInverse * view).xyz;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    // The background beyond the slab is blurred fully, which softens the slab's silhouette too.
    float amount = 1.0;
    if (depth < 1.0) {
      vec3 world = worldPosition(uv, depth);
      vec2 inside = halfSize - abs(world.xz);
      amount = 1.0 - smoothstep(blurredBy, sharpFrom, min(inside.x, inside.y));
    }
    if (amount < 0.01) {
      outputColor = inputColor;
      return;
    }
    // A disc of samples laid out on a golden-angle spiral, scaled to the screen's height.
    float r = radius * amount * resolution.y / 1000.0;
    vec4 sum = inputColor;
    for (int i = 0; i < 32; i++) {
      float angle = float(i) * 2.39996;
      float distance = sqrt((float(i) + 0.5) / 32.0) * r;
      sum += texture2D(inputBuffer, uv + vec2(cos(angle), sin(angle)) * distance * texelSize);
    }
    outputColor = sum / 33.0;
  }
`;

export interface EdgeBlurOptions {
  /** Half the slab's width and depth, in metres. */
  halfSize: [number, number];
  /** How far in from the edges the scene is fully sharp, in metres. */
  sharpFrom: number;
  /** How far in from the edges the blur is at its strongest, in metres. */
  blurredBy: number;
  /** The strongest blur's radius, in pixels on a 1000-pixel-high screen. */
  radius: number;
}

export class EdgeBlurEffect extends Effect {
  private readonly camera: Camera;

  constructor(camera: Camera, { halfSize, sharpFrom, blurredBy, radius }: EdgeBlurOptions) {
    super('EdgeBlurEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['projectionInverse', new Uniform(new Matrix4())],
        ['viewInverse', new Uniform(new Matrix4())],
        ['halfSize', new Uniform(new Vector2(...halfSize))],
        ['sharpFrom', new Uniform(sharpFrom)],
        ['blurredBy', new Uniform(blurredBy)],
        ['radius', new Uniform(radius)],
      ]),
    });
    this.camera = camera;
  }

  override update() {
    this.uniforms.get('projectionInverse')!.value.copy(this.camera.projectionMatrixInverse);
    this.uniforms.get('viewInverse')!.value.copy(this.camera.matrixWorld);
  }
}

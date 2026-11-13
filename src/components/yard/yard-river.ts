import * as THREE from 'three';

/** Slow, downstream surface detail. Geometry and lighting stay unchanged. */
export function createRiverSurface() {
  const clock = {value: 0};
  const material = new THREE.MeshLambertMaterial({color: 0x299cab});
  material.onBeforeCompile = shader => {
    shader.uniforms.uRiverTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRiverUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vRiverUv;
        uniform float uRiverTime;
        float riverHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float riverNoise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(riverHash(cell), riverHash(cell + vec2(1.0, 0.0)), u.x),
            mix(riverHash(cell + vec2(0.0, 1.0)), riverHash(cell + vec2(1.0, 1.0)), u.x), u.y);
        }
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // UV.y is distance along the curved centerline, not a world-axis scroll.
        float along = vRiverUv.y - uRiverTime * 0.35;
        float noise = riverNoise(vec2(vRiverUv.x * 7.0, along * 0.8));
        float wave = sin(along * 3.2 + vRiverUv.x * 21.0 + noise * 3.0);
        float glint = pow(max(0.0, wave), 14.0) * smoothstep(0.4, 0.8, noise);
        float shore = smoothstep(0.22, 0.5, abs(vRiverUv.x - 0.5));
        diffuseColor.rgb *= 0.88 + noise * 0.22;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.83, 0.79), glint * 0.23 + shore * 0.09);
      `);
  };
  material.customProgramCacheKey = () => 'yard-river-flow-v1';
  return {
    material,
    advance(delta: number) { clock.value += delta; },
  };
}

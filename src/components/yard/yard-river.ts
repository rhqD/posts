import * as THREE from 'three';

/**
 * Creek surface shading. The ribbon geometry stays flat; the look comes from:
 * dark deep water, pale shallows, a moving roughness field (so the sun and the
 * environment map sparkle), and foam where the water meets the bank.
 */
export function createRiverSurface() {
  const clock = { value: 0 };

  const material = new THREE.MeshStandardMaterial({
    color: 0x2f8f97,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.96,
    envMapIntensity: 1.15,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRiverTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vRiverUv;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRiverUv = uv;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vRiverUv;
        uniform float uRiverTime;
        float riverHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float riverNoise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(riverHash(cell), riverHash(cell + vec2(1.0, 0.0)), u.x),
            mix(riverHash(cell + vec2(0.0, 1.0)), riverHash(cell + vec2(1.0, 1.0)), u.x), u.y);
        }
        float riverFbm(vec2 p) {
          return riverNoise(p) * 0.55 + riverNoise(p * 2.1 + 13.0) * 0.3 + riverNoise(p * 4.3 + 41.0) * 0.15;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Flow follows the channel: uv.y runs along the creek, uv.x across it.
        vec2 flow = vec2(vRiverUv.x * 6.0, vRiverUv.y * 42.0 - uRiverTime * 2.2);
        float ripple = riverFbm(flow);
        float across = abs(vRiverUv.x - 0.5) * 2.0;

        // Deep water reads dark teal; the shallows near the bank lift towards
        // a pale green-blue, which is what makes a stream look like water.
        vec3 deep = vec3(0.035, 0.20, 0.24);
        vec3 shallow = vec3(0.28, 0.58, 0.56);
        float shallowMix = smoothstep(0.35, 1.0, across) * 0.8 + ripple * 0.16;
        diffuseColor.rgb = mix(deep, shallow, clamp(shallowMix, 0.0, 1.0));

        // Thin foam line where the surface meets the bank.
        float foam = smoothstep(0.86, 1.0, across) * (0.45 + ripple * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.94, 0.91), foam * 0.55);
        diffuseColor.a *= mix(0.94, 0.6, smoothstep(0.9, 1.0, across));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Moving patches of calm and chop: this is what gives the sun glints.
        roughnessFactor = mix(0.05, 0.34, riverFbm(vec2(vRiverUv.x * 9.0, vRiverUv.y * 70.0 - uRiverTime * 3.4)));`,
      );
  };
  material.customProgramCacheKey = () => 'yard-river-water-v3';

  return {
    material,
    advance(delta: number) {
      clock.value += delta;
    },
  };
}

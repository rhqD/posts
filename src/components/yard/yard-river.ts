import * as THREE from 'three';

/**
 * Stylised creek: a flat cyan surface with thin white ripple lines and a foam
 * edge, matching the low-poly diorama look rather than photoreal water.
 *
 * vRiverUv.y is world length along the creek (0..~450 m), not 0..1.
 */
export function createRiverSurface() {
  const clock = { value: 0 };

  const material = new THREE.MeshStandardMaterial({
    color: 0x2f8f97,
    roughness: 0.3,
    metalness: 0,
    transparent: true,
    opacity: 0.97,
    envMapIntensity: 0.7,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRiverTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vRiverUv;\nuniform float uRiverTime;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRiverUv = uv;
        float wobble = sin(uv.y * 1.3 - uRiverTime * 2.6) * 0.6
          + sin(uv.x * 4.0 + uv.y * 0.6 - uRiverTime * 1.8) * 0.4;
        transformed.y += wobble * 0.01;`,
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
        float across = abs(vRiverUv.x - 0.5) * 2.0;
        float slow = riverFbm(vec2(vRiverUv.x * 3.0, vRiverUv.y * 0.45 - uRiverTime * 1.6));

        // Flat, saturated cyan with only a gentle tone shift across the channel.
        vec3 deep = vec3(0.030, 0.19, 0.23);
        vec3 light = vec3(0.27, 0.56, 0.55);
        vec3 base = mix(deep, light, slow * 0.55 + smoothstep(0.2, 1.0, across) * 0.25);

        // Whitewater filaments stretched along the flow: high frequency across
        // the channel, low frequency downstream, so they read as running
        // streaks instead of regular bands.
        vec2 streakUv = vec2(vRiverUv.x * 30.0, vRiverUv.y * 0.5 - uRiverTime * 5.0);
        float streak = riverFbm(streakUv) * 0.65 + riverFbm(streakUv * 2.7 + 17.0) * 0.35;
        float white = smoothstep(0.60, 0.84, streak);
        base = mix(base, vec3(0.92, 0.98, 0.97), white * 0.5 * smoothstep(0.04, 0.5, across));

        // Foam collar at the bank, then a clean fade out.
        float foam = smoothstep(0.84, 1.0, across);
        base = mix(base, vec3(0.93, 0.99, 1.0), foam * 0.65);

        diffuseColor.rgb = base;
        diffuseColor.a *= mix(0.97, 0.72, smoothstep(0.9, 1.0, across));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.2, 0.42,
          riverFbm(vec2(vRiverUv.x * 6.0, vRiverUv.y * 0.6 - uRiverTime * 3.0)));`,
      );
  };
  material.customProgramCacheKey = () => 'yard-river-diorama-v5';

  return {
    material,
    advance(delta: number) {
      clock.value += delta;
    },
  };
}

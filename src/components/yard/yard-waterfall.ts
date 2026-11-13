import * as THREE from 'three';

/** A falling sheet follows the mountain riverbed and rejoins the flat stream. */
export function createYardWaterfall(site: {
  height: (x: number, z: number) => number;
  riverX: (z: number) => number;
  width: (z: number) => number;
  waterY: number;
}) {
  const group = new THREE.Group();
  group.name = 'Mountain source waterfall';
  const clock = {value: 0};
  const topZ = -110, baseZ = -100;
  const topY = site.height(site.riverX(topZ), topZ) + .18;
  const drop = topY - site.waterY;
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rows = 100, columns = 8;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, z = THREE.MathUtils.lerp(topZ, baseZ, t);
    const center = site.riverX(z);
    const tangent = new THREE.Vector3(site.riverX(z + .1) - site.riverX(z - .1), 0, .2).normalize();
    const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
    const halfWidth = THREE.MathUtils.lerp(1.8, site.width(baseZ) * 1.15, t);
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const spread = (u * 2 - 1) * halfWidth * (1 + .035 * Math.sin(t * 43));
      const y = topY - drop * t * t + Math.sin(u * 18 + t * 23) * .035 * Math.sin(t * Math.PI);
      vertices.push(center + side.x * spread, y, z + side.z * spread);
      uvs.push(u, t * drop);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const water = new THREE.MeshLambertMaterial({color: 0x4da8bb, side: THREE.DoubleSide, transparent: true, opacity: .94, depthWrite: false});
  water.onBeforeCompile = shader => {
    shader.uniforms.uFallTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFallUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;\nuniform float uFallTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float falling = vFallUv.y - uFallTime * 5.0;
        float streak = pow(sin(vFallUv.x * 61.0 + sin(vFallUv.x * 19.0) * 2.0 + sin(falling * 0.6) * 1.4) * 0.5 + 0.5, 3.0);
        float foam = pow(sin(falling * 4.0 + sin(vFallUv.x * 27.0) * 2.0) * 0.5 + 0.5, 2.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.98, 1.0), 0.18 + streak * foam * 0.65);
        diffuseColor.a *= smoothstep(0.0, 0.045, vFallUv.x) * smoothstep(0.0, 0.045, 1.0 - vFallUv.x);
      `);
  };
  water.customProgramCacheKey = () => 'yard-waterfall-v1';
  const sheet = new THREE.Mesh(geometry, water);
  sheet.receiveShadow = true;
  group.add(sheet);

  // Expanding foam rings sit on the receiving river, with no reflection pass.
  const foamMaterial = new THREE.MeshLambertMaterial({color: 0xe5fcf6, transparent: true, depthWrite: false, side: THREE.DoubleSide});
  foamMaterial.onBeforeCompile = shader => {
    shader.uniforms.uFallTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSplashUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplashUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSplashUv;\nuniform float uFallTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float radius = length(vSplashUv - 0.5);
        float ring = abs(radius - fract(uFallTime * 0.5) * 0.48);
        float ripple = 1.0 - smoothstep(0.015, 0.06, ring);
        float core = 1.0 - smoothstep(0.05, 0.25, radius);
        diffuseColor.a *= (core * 0.55 + ripple * 0.45) * (1.0 - smoothstep(0.3, 0.5, radius));
      `);
  };
  foamMaterial.customProgramCacheKey = () => 'yard-waterfall-splash-v1';
  const foam = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), foamMaterial);
  foam.rotation.x = -Math.PI / 2;
  foam.scale.set(.85, 1.4, 1);
  foam.position.set(site.riverX(baseZ), site.waterY + .055, baseZ + 1.1);
  group.add(foam);

  const stone = new THREE.IcosahedronGeometry(1, 1);
  const stoneMaterial = new THREE.MeshStandardMaterial({color: 0x6b7c73, roughness: 1});
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const z = topZ + i * 2;
    const x = site.riverX(z) + side * (2.4 + Math.sin(i * 2) * .3);
    const rock = new THREE.Mesh(stone, stoneMaterial);
    rock.position.set(x, site.height(x, z) + .2, z);
    rock.scale.set(.8 + (i % 2) * .4, .6 + (i % 3) * .3, 1.1);
    rock.rotation.set(i * .3, i + side, .2);
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
  }
  return { group, advance(delta: number) { clock.value += delta; } };
}

import * as THREE from 'three';

/**
 * Water spilling out of the mountain stream where it meets the flat creek.
 *
 * The sheet rides the carved cliff face. The plunge point is deliberately
 * cartoonish: a crown of low-poly spikes, ballistic droplets and foam rings
 * rather than a particle mist, so it reads at a glance from any angle.
 */
export function createYardWaterfall(site: {
  height: (x: number, z: number) => number;
  riverX: (z: number) => number;
  width: (z: number) => number;
  waterY: number;
}) {
  const group = new THREE.Group();
  group.name = 'Mountain source waterfall';
  const clock = { value: 0 };

  const topZ = -110, baseZ = -100;
  const poolX = site.riverX(baseZ);
  const baseWidth = Math.max(1.6, site.width(baseZ) * 1.1);
  const poolZ = baseZ + 0.6;

  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rows = 96, columns = 8;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const z = THREE.MathUtils.lerp(topZ, baseZ, t);
    const center = site.riverX(z);
    const tangent = new THREE.Vector3(site.riverX(z + 0.1) - site.riverX(z - 0.1), 0, 0.2).normalize();
    const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
    const halfWidth = THREE.MathUtils.lerp(0.6, baseWidth * 0.85, Math.pow(t, 0.75));
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const spread = (u * 2 - 1) * halfWidth * (1 + 0.05 * Math.sin(t * 17));
      const sway = Math.sin(t * 5.5 + u * 3) * 0.12 * t;
      const px = center + side.x * spread + sway;
      const pz = z + side.z * spread;
      // Ride the carved rock face: an independent curve sinks into the cliff.
      const y = site.height(px, pz) + 0.1
        + Math.sin(u * 14 + t * 9) * 0.02 * Math.sin(t * Math.PI);
      vertices.push(px, y, pz);
      uvs.push(u, t);
    }
    if (row < rows) {
      for (let column = 0; column < columns; column++) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const water = new THREE.MeshStandardMaterial({
    color: 0xc8ecf9,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 0.9,
  });
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uFallTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFallUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vFallUv;
        uniform float uFallTime;
        float fallHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fallNoise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(fallHash(cell), fallHash(cell + vec2(1.0, 0.0)), u.x),
            mix(fallHash(cell + vec2(0.0, 1.0)), fallHash(cell + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fallFbm(vec2 p) {
          return fallNoise(p) * 0.55 + fallNoise(p * 2.1 + 13.0) * 0.3 + fallNoise(p * 4.3 + 41.0) * 0.15;
        }`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Irregular filaments: noise across the sheet with a slow vertical scroll,
        // so no two streaks line up in a repeating column pattern.
        vec2 laneUv = vec2(vFallUv.x * 26.0, vFallUv.y * 2.4 - uFallTime * 3.2);
        float lanes = fallFbm(laneUv) * 0.7 + fallFbm(laneUv * 2.9 + 9.0) * 0.3;
        float thread = smoothstep(0.52, 0.86, lanes);
        float foam = smoothstep(0.45, 1.0, vFallUv.y) + (1.0 - smoothstep(0.0, 0.18, vFallUv.y)) * 0.6;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(thread * 0.45 + foam * 0.55, 0.0, 1.0));
        diffuseColor.a *= (0.5 + thread * 0.35 + foam * 0.3)
          * smoothstep(0.0, 0.06, vFallUv.x) * smoothstep(0.0, 0.06, 1.0 - vFallUv.x);`,
      );
  };
  water.customProgramCacheKey = () => 'yard-waterfall-v4';

  const sheet = new THREE.Mesh(geometry, water);
  sheet.renderOrder = 2;
  group.add(sheet);

  // ---- cartoon plunge splash -------------------------------------------------
  const foamColor = 0xffffff;
  const splashMaterial = () => new THREE.MeshStandardMaterial({
    color: foamColor, roughness: 0.2, metalness: 0,
    transparent: true, opacity: 0.96,
    emissive: 0xe8f8ff, emissiveIntensity: 0.12,
  });

  // Flat, bright foam pool the bubbles sit in.
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(baseWidth * 2.3, 28),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.65, transparent: true,
      opacity: 0.78, depthWrite: false,
    }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(poolX, site.waterY + 0.04, poolZ);
  puddle.renderOrder = 3;
  group.add(puddle);

  // Round bubbles popping around the impact: no cones or pointed shapes.
  const bubbleGeometry = new THREE.IcosahedronGeometry(1, 1);
  const crown: { mesh: THREE.Mesh; angle: number; reach: number; delay: number; size: number }[] = [];
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2 + (i % 3) * 0.14;
    const mesh = new THREE.Mesh(bubbleGeometry, splashMaterial());
    mesh.renderOrder = 4;
    group.add(mesh);
    crown.push({
      mesh, angle,
      reach: baseWidth * (0.55 + (i % 7) * 0.17),
      delay: (i % 6) * 0.07,
      size: 0.13 + (i % 4) * 0.055,
    });
  }

  // Ballistic droplets, each on its own loop so they never pulse in sync.
  const droplets: { mesh: THREE.Mesh; angle: number; speed: number; lift: number; phase: number; size: number }[] = [];
  for (let i = 0; i < 36; i++) {
    const mesh = new THREE.Mesh(bubbleGeometry, splashMaterial());
    mesh.renderOrder = 5;
    group.add(mesh);
    droplets.push({
      mesh,
      angle: (i / 36) * Math.PI * 2 + i * 0.53,
      speed: 1.3 + (i % 5) * 0.3,
      lift: 1.8 + (i % 4) * 0.5,
      phase: (i * 0.37) % 1,
      size: 0.1 + (i % 4) * 0.05,
    });
  }

  // Expanding foam rings on the pool surface.
  const rings: { mesh: THREE.Mesh; phase: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 40, 1),
      new THREE.MeshBasicMaterial({
        color: foamColor, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(poolX, site.waterY + 0.055, poolZ);
    ring.renderOrder = 4;
    group.add(ring);
    rings.push({ mesh: ring, phase: i / 3 });
  }

  const cycle = 2.4;

  return {
    group,
    advance(delta: number) {
      clock.value += delta;
      const t = (clock.value % cycle) / cycle;

      for (const bubble of crown) {
        const local = THREE.MathUtils.clamp((t - bubble.delay) / 0.55, 0, 1);
        const grow = Math.sin(Math.PI * local);
        const material = bubble.mesh.material as THREE.MeshStandardMaterial;
        material.opacity = 0.96 * grow;
        const scale = bubble.size * (0.5 + grow * 1.6);
        bubble.mesh.scale.setScalar(scale);
        bubble.mesh.position.set(
          poolX + Math.sin(bubble.angle) * bubble.reach * grow,
          site.waterY + 0.05 + grow * bubble.size * 2.4,
          poolZ + Math.cos(bubble.angle) * bubble.reach * grow * 0.75,
        );
        bubble.mesh.rotation.set(grow * 1.2, bubble.angle, grow * 0.8);
      }

      for (const drop of droplets) {
        drop.phase = (drop.phase + delta * 0.55) % 1;
        const life = drop.phase;
        const radius = drop.speed * life * baseWidth * 0.62;
        const material = drop.mesh.material as THREE.MeshStandardMaterial;
        material.opacity = Math.max(0, 1 - life * 1.1);
        const scale = drop.size * (1 - life * 0.3);
        drop.mesh.scale.setScalar(scale);
        drop.mesh.position.set(
          poolX + Math.sin(drop.angle) * radius,
          site.waterY + 0.12 + drop.lift * life - 3.2 * life * life * (drop.lift / 1.8),
          poolZ + Math.cos(drop.angle) * radius * 0.75,
        );
        drop.mesh.rotation.set(life * 3, drop.angle, life * 2);
      }

      for (const ring of rings) {
        ring.phase = (ring.phase + delta * 0.4) % 1;
        const scale = 0.9 + ring.phase * baseWidth * 2.8;
        ring.mesh.scale.set(scale, scale, 1);
        (ring.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - ring.phase) * 0.62;
      }
    },
  };
}

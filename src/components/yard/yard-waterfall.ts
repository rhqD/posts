import * as THREE from 'three';

/**
 * Water spilling out of the mountain stream where it meets the flat creek.
 *
 * The sheet is deliberately narrow and slightly translucent rather than a wide
 * opaque curtain, and it is finished with rising mist at the base — that is what
 * sells "falling water" at this scale.
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
  const topY = site.height(site.riverX(topZ), topZ) + 0.15;
  const drop = Math.max(0.5, topY - site.waterY);
  const baseWidth = Math.max(1.2, site.width(baseZ) * 1.05);

  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rows = 96, columns = 6;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const z = THREE.MathUtils.lerp(topZ, baseZ, t);
    const center = site.riverX(z);
    const tangent = new THREE.Vector3(site.riverX(z + 0.1) - site.riverX(z - 0.1), 0, 0.2).normalize();
    const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
    // Narrow lip, spreading as it falls, with a slow sway so the edge is not a
    // straight ruling line.
    const halfWidth = THREE.MathUtils.lerp(0.55, baseWidth * 0.5, Math.pow(t, 0.7));
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const spread = (u * 2 - 1) * halfWidth * (1 + 0.05 * Math.sin(t * 17));
      const sway = Math.sin(t * 5.5 + u * 3) * 0.12 * t;
      const y = topY - drop * Math.pow(t, 1.25)
        + Math.sin(u * 14 + t * 9) * 0.02 * Math.sin(t * Math.PI);
      vertices.push(center + side.x * spread + sway, y, z + side.z * spread);
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
    color: 0xdff3f6,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
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
      .replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;\nuniform float uFallTime;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Fast vertical streaks: falling water is streaky, not glassy.
        float streak = fract(vFallUv.x * 13.0 + sin(vFallUv.x * 7.0) * 0.35);
        float speed = 1.0 - vFallUv.y;                     // accelerates downwards
        float flow = fract(vFallUv.y * 3.0 - uFallTime * (0.9 + speed * 0.9));
        float thread = smoothstep(0.45, 0.95, streak) * smoothstep(0.1, 0.9, flow);
        // Aerated at the lip and at the plunge pool.
        float foam = smoothstep(0.55, 1.0, vFallUv.y) + (1.0 - smoothstep(0.0, 0.18, vFallUv.y)) * 0.6;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(thread * 0.45 + foam * 0.5, 0.0, 1.0));
        diffuseColor.a *= (0.42 + thread * 0.38 + foam * 0.25)
          * smoothstep(0.0, 0.06, vFallUv.x) * smoothstep(0.0, 0.06, 1.0 - vFallUv.x);`,
      );
  };
  water.customProgramCacheKey = () => 'yard-waterfall-v2';

  const sheet = new THREE.Mesh(geometry, water);
  sheet.renderOrder = 2;
  group.add(sheet);

  // Two thin foam collars at the plunge point instead of one big disc.
  const foamMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2fbf8,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  for (const [scale, offset, opacity] of [[1.0, 0.2, 0.3], [1.55, 1.4, 0.18]] as const) {
    const collar = new THREE.Mesh(new THREE.RingGeometry(0.6 * scale, 1.05 * scale, 40, 1), foamMaterial.clone());
    (collar.material as THREE.MeshBasicMaterial).opacity = opacity;
    collar.rotation.x = -Math.PI / 2;
    collar.position.set(site.riverX(baseZ), site.waterY + 0.045, baseZ + offset);
    group.add(collar);
  }

  // Rising mist. Sprites are cheap and read much better than a static plane.
  const mist = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.16)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);
    return new THREE.CanvasTexture(canvas);
  })();

  const puffs: { sprite: THREE.Sprite; life: number; speed: number; rise: number }[] = [];
  if (mist) {
    const random = (() => { let seed = 7; return () => (seed = (seed * 16807) % 2147483647) / 2147483647; })();
    for (let i = 0; i < 14; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mist, transparent: true, depthWrite: false, opacity: 0.0,
      }));
      const spread = baseWidth * (0.5 + random() * 0.9);
      sprite.position.set(
        site.riverX(baseZ) + (random() - 0.5) * spread,
        site.waterY + 0.25 + random() * 0.5,
        baseZ + (random() - 0.5) * 2.4,
      );
      const size = 1.4 + random() * 1.8;
      sprite.scale.set(size, size, 1);
      group.add(sprite);
      puffs.push({ sprite, life: random(), speed: 0.18 + random() * 0.14, rise: 0.9 + random() * 1.1 });
    }
  }

  const baseMistOpacity = 0.22;

  return {
    group,
    advance(delta: number) {
      clock.value += delta;
      for (const puff of puffs) {
        puff.life = (puff.life + delta * puff.speed) % 1;
        const t = puff.life;
        puff.sprite.position.y = site.waterY + 0.2 + t * puff.rise;
        const fade = Math.sin(Math.PI * t);
        const material = puff.sprite.material as THREE.SpriteMaterial;
        material.opacity = fade * baseMistOpacity;
        const scale = 1.2 + t * 2.2;
        puff.sprite.scale.set(scale, scale, 1);
      }
    },
  };
}

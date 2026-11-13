import * as THREE from 'three';
import { createRiverSurface } from './yard-river';
import { createYardWaterfall } from './yard-waterfall';

/** A quiet mountain garden. All scenery is local, seeded, and shared on the GPU. */
export function createYardEnvironment() {
  const group = new THREE.Group();
  group.name = 'Mountain garden';
  const floor = -1.03;
  let seed = 4187;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const smooth = THREE.MathUtils.smoothstep;
  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: .95 });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const object = new THREE.Mesh(geometry, material);
    object.receiveShadow = true;
    group.add(object);
    return object;
  };
  // Unequal bends, rather than a repeating sine wave, make a small valley stream.
  const bends = [[-210, -76], [-115, -64], [-77, -39], [-47, -49], [-16, -26], [10, -30], [34, -46], [70, -36], [120, -62], [210, -85]];
  const riverX = (z: number) => {
    let i = 0;
    while (i < bends.length - 2 && z > bends[i + 1][0]) i++;
    const t = THREE.MathUtils.clamp((z - bends[i][0]) / (bends[i + 1][0] - bends[i][0]), 0, 1);
    const a = bends[Math.max(0, i - 1)][1], b = bends[i][1];
    const c = bends[i + 1][1], d = bends[Math.min(bends.length - 1, i + 2)][1];
    return .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  };
  const width = (z: number) => 2.1 + .3 * Math.sin(z * .14) + .16 * Math.cos(z * .31);
  const riverDistance = (x: number, z: number) => Math.abs(x - riverX(z)) / width(z);
  const peaks = [
    [-82, -123, 32, 32, 37], [-41, -151, 43, 32, 35], [5, -166, 49, 34, 41],
    [58, -153, 39, 37, 34], [95, -115, 29, 33, 37], [-111, -79, 24, 27, 37],
  ];
  const naturalHeight = (x: number, z: number) => {
    const away = smooth(Math.hypot((x - 4.5) * 1.3, z + 13), 23, 60);
    const hills = away * (1.2 + Math.sin(x * .043 + z * .021) * 1.4 + Math.cos(z * .057) * .8);
    let mountains = 0;
    for (const [px, pz, h, sx, sz] of peaks) {
      const ridge = Math.exp(-(((x - px) / sx) ** 2 + ((z - pz) / sz) ** 2) * 1.8);
      mountains += h * ridge;
    }
    const detail = 1 + .12 * Math.sin(x * .18 + z * .13) + .07 * Math.cos(x * .32 - z * .15);
    const land = floor + hills + mountains * detail;
    // Stream disappears naturally into the mountain valley upstream.
    const channel = (1 - smooth(riverDistance(x, z), .7, 1.9)) * (1 - smooth(mountains, 3, 12));
    return THREE.MathUtils.lerp(land, floor - 1.8, channel);
  };
  const fallTop = naturalHeight(riverX(-110), -110) + .18;
  const height = (x: number, z: number) => {
    const natural = naturalHeight(x, z);
    if (z < -110 || z > -100) return natural;
    const t = (z + 110) / 10;
    const rockBed = fallTop - (fallTop - (floor - .38)) * t * t - .18;
    const channel = 1 - smooth(riverDistance(x, z), .7, 2.8);
    return THREE.MathUtils.lerp(natural, rockBed, channel);
  };
  const terrain = new THREE.PlaneGeometry(420, 420, 320, 320);
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  const colors: number[] = [];
  const meadow = new THREE.Color(0x6f9e46), moss = new THREE.Color(0x377c49), stone = new THREE.Color(0x688678);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = height(x, z);
    positions.setY(i, y);
    const patch = .5 + .25 * Math.sin(x * .15 + z * .08) + .25 * Math.cos(z * .19 - x * .06);
    const color = meadow.clone().lerp(moss, patch * .6 + (1 - smooth(riverDistance(x, z), 1.5, 5)) * .25);
    color.lerp(stone, smooth(y, 8, 35));
    const cliff = smooth(z, -114, -109) * (1 - smooth(z, -102, -97)) * (1 - smooth(riverDistance(x, z), 1.4, 4));
    color.lerp(new THREE.Color(0x536b63), cliff * .95).multiplyScalar(.96 + random() * .08);
    colors.push(color.r, color.g, color.b);
  }
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));

  const ribbon = (offsets: number[], level: (x: number, z: number) => number, side = 1, valleyOnly = false) => {
    const vertices: number[] = [], indices: number[] = [], uvs: number[] = [];
    let length = 0, previousX = riverX(-210), previousZ = -210;
    for (let i = 0; i <= 520; i++) {
      const z = -210 + i / 520 * 420;
      const center = riverX(z);
      length += Math.hypot(center - previousX, z - previousZ);
      previousX = center; previousZ = z;
      for (const offset of offsets) {
        const x = riverX(z) + offset * width(z) * side;
        vertices.push(x, level(x, z), z);
        uvs.push(offset / 2.8 + .5, length);
      }
      if (i < 520 && (!valleyOnly || Math.max(height(riverX(z) - width(z) * 1.94, z), height(riverX(z) + width(z) * 1.94, z)) < floor + 1.5)) for (let j = 0; j < offsets.length - 1; j++) {
        const a = i * offsets.length + j, b = a + offsets.length;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  };
  const waterY = floor - .38;
  const river = createRiverSurface();
  const riverMesh = mesh(ribbon([-1.4, 1.4], () => waterY), river.material);
  riverMesh.name = 'Flowing creek';
  riverMesh.geometry.computeBoundingSphere();
  const waterfall = createYardWaterfall({height, riverX, width, waterY});
  group.add(waterfall.group);
  const bank = new THREE.MeshStandardMaterial({color: 0x90957c, roughness: 1, side: THREE.DoubleSide});
  for (const side of [-1, 1]) mesh(ribbon([1.18, 1.35, 1.55, 1.75, 1.94], (x, z) => height(x, z) + .025, side, true), bank);

  // Tall, irregular conifers replace the repeated spherical canopies.
  const crownVertices: number[] = [], crownColors: number[] = [];
  const pineDark = new THREE.Color(0x194f34), pineLight = new THREE.Color(0x4d913e);
  for (let tier = 0; tier < 5; tier++) {
    const base = .22 + tier * .135, radius = .245 * (1 - tier * .15), tip = base + .35;
    for (let j = 0; j < 13; j++) {
      const a = j / 13 * Math.PI * 2, b = (j + 1) / 13 * Math.PI * 2;
      const ra = radius * (.75 + random() * .4), rb = radius * (.75 + random() * .4);
      crownVertices.push(Math.cos(a) * ra, base - random() * .04, Math.sin(a) * ra,
        0, tip, 0, Math.cos(b) * rb, base - random() * .04, Math.sin(b) * rb);
      const color = pineDark.clone().lerp(pineLight, random() * .7);
      for (let k = 0; k < 3; k++) crownColors.push(color.r, color.g, color.b);
    }
  }
  const crownGeometry = new THREE.BufferGeometry();
  crownGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crownVertices, 3));
  crownGeometry.setAttribute('color', new THREE.Float32BufferAttribute(crownColors, 3));
  crownGeometry.computeVertexNormals();
  const trees: {x: number; z: number; h: number}[] = [];
  const groves = [[-62, -24, 14, 22, 20], [-18, -46, 12, 12, 15], [26, -43, 15, 20, 23], [43, -6, 9, 12, 12], [-61, 33, 12, 17, 13]];
  for (const [cx, cz, rx, rz, count] of groves) {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random());
      const x = cx + Math.cos(a) * r * rx, z = cz + Math.sin(a) * r * rz;
      if (riverDistance(x, z) < 2.4) continue;
      trees.push({x, z, h: 6 + random() * 7});
    }
  }
  const crowns = new THREE.InstancedMesh(crownGeometry, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, side: THREE.DoubleSide}), trees.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .11, 1, 7), mat(0x645b49), trees.length);
  const dummy = new THREE.Object3D();
  trees.forEach(({x, z, h}, i) => {
    const y = height(x, z);
    dummy.position.set(x, y, z); dummy.rotation.set(0, random() * Math.PI * 2, .025 * (random() - .5));
    dummy.scale.set(h * (.8 + random() * .25), h, h * .9); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
    dummy.position.y = y + h * .3; dummy.scale.set(h * .38, h * .6, h * .38);
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
  });
  crowns.castShadow = trunks.castShadow = true;
  crowns.receiveShadow = trunks.receiveShadow = true;
  group.add(crowns, trunks);

  // Stones cluster at bends, with generous open ground around the house.
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(0x85897d), 100);
  for (let i = 0; i < 100; i++) {
    const z = -65 + random() * 115;
    const side = i % 2 ? 1 : -1;
    const x = riverX(z) + side * width(z) * (1.6 + random() * 1.4);
    const size = .2 + random() ** 2 * 1.05;
    dummy.position.set(x, height(x, z) + size * .25, z);
    dummy.rotation.set(random(), random() * 6, random()); dummy.scale.set(size * 1.2, size * .65, size);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    rocks.setColorAt(i, new THREE.Color(i % 3 ? 0xa2a18e : 0x626f63));
  }
  rocks.castShadow = true; rocks.receiveShadow = true; group.add(rocks);

  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.19, 0, 0, .04, 1, .08, .08, 0, 0, 0, 0, -.16, -.06, .8, .03, 0, 0, .14,
    -.12, 0, -.12, .18, .65, .14, .12, 0, .12,
  ], 3));
  grassGeometry.computeVertexNormals();
  const grasses = new THREE.InstancedMesh(grassGeometry, new THREE.MeshStandardMaterial({color: 0x777e58, side: THREE.DoubleSide, roughness: 1}), 1600);
  for (let i = 0; i < 1600; i++) {
    const z = -65 + random() * 125, side = i % 2 ? 1 : -1;
    const x = riverX(z) + side * width(z) * (2 + random() ** 2 * 4);
    dummy.position.set(x, height(x, z), z); dummy.rotation.set(0, random() * 6, 0);
    const size = .2 + random() * .45;
    dummy.scale.set(size, size, size); dummy.updateMatrix(); grasses.setMatrixAt(i, dummy.matrix);
    grasses.setColorAt(i, new THREE.Color().setHSL(.19 + random() * .1, .35 + random() * .25, .32 + random() * .16));
  }
  group.add(grasses);

  // Broad stone treads and gravel make a short, human-scale arrival at the gate.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(4.5, floor + .045, .4), new THREE.Vector3(4.5, floor + .045, 6),
    new THREE.Vector3(9, floor + .045, 13), new THREE.Vector3(20, floor + .045, 18),
    new THREE.Vector3(35, floor + .045, 19),
  ]);
  const pathVertices: number[] = [], pathIndices: number[] = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100, point = path.getPoint(t), tangent = path.getTangent(t);
    const offset = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(.9);
    pathVertices.push(...point.clone().add(offset).toArray(), ...point.clone().sub(offset).toArray());
    if (i < 100) { const a = i * 2; pathIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pathVertices, 3));
  pathGeometry.setIndex(pathIndices); pathGeometry.computeVertexNormals();
  mesh(pathGeometry, mat(0xb7b19b));
  const treadGeometry = new THREE.BoxGeometry(1.55, .09, .6), treadMaterial = mat(0xd0ccba);
  for (let i = 0; i < 11; i++) {
    const tread = mesh(treadGeometry, treadMaterial);
    const t = i / 32, point = path.getPoint(t), tangent = path.getTangent(t);
    tread.position.copy(point); tread.position.y += .06;
    tread.rotation.y = Math.atan2(tangent.x, tangent.z);
  }

  return {
    group,
    advanceWater(delta: number) { river.advance(delta); waterfall.advance(delta); },
    riverBounds: riverMesh.geometry.boundingSphere!,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      group.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.removeFromParent();
    },
  };
}

import * as THREE from 'three';

type Terrain = {
  height: (x: number, z: number) => number;
  riverX: (z: number) => number;
  waterY: number;
};

/** Small, locally built animals; no extra model downloads or animation library. */
export function createYardWildlife(terrain: Terrain) {
  const group = new THREE.Group();
  group.name = 'Creek ducks and meadow rabbits';
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const surface = (color: number) => new THREE.MeshStandardMaterial({color, roughness: .85});
  const cream = surface(0xfaf1d7), white = surface(0xfffcf0), brown = surface(0x805a37);
  const green = surface(0x167c56), orange = surface(0xe9a231), dark = surface(0x182221);
  const pink = surface(0xe8a5a1), grey = surface(0xb9b4a3), wing = surface(0x9d7852);
  const part = (parent: THREE.Group, material: THREE.Material, position: number[], scale: number[], geometry: THREE.BufferGeometry = sphere) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const ducks: {object: THREE.Group; z: number; offset: number; phase: number}[] = [];
  for (let i = 0; i < 4; i++) {
    const duck = new THREE.Group();
    duck.name = i === 0 ? 'Mallard' : `Duckling ${i}`;
    const adult = i === 0;
    part(duck, adult ? cream : white, [0, .22, 0], [.32, .23, .5]);
    part(duck, adult ? green : cream, [0, .48, .32], [.14, .24, .15]);
    part(duck, adult ? green : cream, [0, .68, .42], [.2, .2, .21]);
    part(duck, orange, [0, .64, .66], [.19, .065, .23], box);
    for (const side of [-1, 1]) {
      part(duck, dark, [side * .165, .73, .53], [.028, .028, .026]);
      part(duck, adult ? wing : cream, [side * .28, .27, -.06], [.07, .16, .32]);
    }
    part(duck, adult ? brown : cream, [0, .28, -.45], [.18, .11, .2]);
    if (adult) part(duck, white, [0, .43, .34], [.15, .04, .16]);
    const size = adult ? 1.15 : .72 + i * .06;
    duck.scale.setScalar(size);
    ducks.push({object: duck, z: 3 + i * 1.35, offset: (i % 2 ? -.7 : .6), phase: i * 1.9});
    group.add(duck);
  }

  const rabbits: {object: THREE.Group; ears: THREE.Mesh[]; phase: number; y: number}[] = [];
  const spots = [[-19, 10], [-17, 7], [-10, 4]];
  spots.forEach(([x, z], i) => {
    const rabbit = new THREE.Group();
    rabbit.name = `Meadow rabbit ${i + 1}`;
    const fur = i === 1 ? grey : cream;
    part(rabbit, fur, [0, .42, -.06], [.32, .36, .46]);
    part(rabbit, fur, [0, .72, .34], [.25, .26, .25]);
    part(rabbit, white, [0, .43, -.48], [.15, .15, .15]);
    part(rabbit, pink, [0, .68, .59], [.045, .035, .035]);
    const ears: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const ear = part(rabbit, fur, [side * .12, 1.06, .33], [.08, .34, .085]);
      ear.rotation.z = side * .14;
      // The inner ear shares the ear transform and moves with it.
      const inner = new THREE.Mesh(sphere, pink);
      inner.position.set(0, .06, .8); inner.scale.set(.55, .75, .25);
      ear.add(inner); ears.push(ear);
      part(rabbit, dark, [side * .17, .78, .51], [.032, .035, .027]);
      part(rabbit, fur, [side * .25, .15, -.22], [.16, .15, .27]);
      part(rabbit, fur, [side * .14, .12, .31], [.1, .12, .18]);
    }
    rabbit.scale.setScalar(i === 2 ? 1 : 1.3);
    rabbit.position.set(x, terrain.height(x, z), z);
    rabbit.rotation.y = [-.7, 1.2, -.3][i];
    rabbits.push({object: rabbit, ears, phase: i * 2.3, y: rabbit.position.y});
    group.add(rabbit);
  });

  let clock = 0;
  const update = (delta: number) => {
    clock += delta;
    ducks.forEach(({object, z, offset, phase}) => {
      const currentZ = z + Math.sin(clock * .15 + phase) * 1.3;
      object.position.set(terrain.riverX(currentZ) + offset, terrain.waterY + .025 + Math.sin(clock * 1.4 + phase) * .025, currentZ);
      object.rotation.y = Math.atan2(terrain.riverX(currentZ + .2) - terrain.riverX(currentZ - .2), .4) + Math.sin(clock * .2 + phase) * .15;
      object.rotation.z = Math.sin(clock * 1.2 + phase) * .035;
    });
    rabbits.forEach(({object, ears, phase, y}) => {
      object.position.y = y + Math.sin(clock * 1.8 + phase) * .012;
      ears.forEach((ear, index) => { ear.rotation.z = (index ? 1 : -1) * .14 + Math.sin(clock * .8 + phase) ** 12 * .14; });
    });
  };
  update(0);
  return {group, update};
}

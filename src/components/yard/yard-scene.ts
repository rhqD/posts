// @ts-nocheck
// Ported from the yabai_home three.js preview. The scene is imperative by nature;
// typing every three.js call would add noise without catching real bugs.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { beijingClock, parseBeijingTime, solarPosition, YARD_SITE } from './yard-solar';
import { createYardEnvironment } from './yard-environment';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export async function createYardScene(root: HTMLElement, opts: { pillClass?: string } = {}) {







const $ = (selector: string) => root.querySelector(selector) as HTMLElement;
const models = {
  light: { url: '/models/yard-web.glb', report: '/models/yard-web.report.json', label: '纯色轻量版' },

};
// glTF is Y-up: Blender (X,Y,Z) becomes (X,Z,-Y). North is +Z here.
const b = (x, y, z) => new THREE.Vector3(x, z, -y);
let renderer, scene, camera, controls, model, fullBounds;
let onResize: (() => void) | undefined;
let activeView = 'landscape', transition = null, loadId = 0, dirty = true, wireframe = false;
let sun, hemisphere;
let followingRealtime = true, sunTimer;
const desktopSun = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
const sunEvents = new AbortController();
let displayedInstant = new Date();
let floodlight = null, floodlightOn = false, floodlightLens = null, pointerDown = null, floodlightProfile = null;
const lampRaycaster = new THREE.Raycaster();
const LIGHTS = await fetch('/yard/lights.json').then(r => r.json());
const extraLights = Object.fromEntries(LIGHTS.groups.map(({ key, label, ...g }) => [key, { ...g, offset: new THREE.Vector3(...(g.offset ?? [])) }]));
const lampList = document.getElementById('lamp-list');
lampList.innerHTML = LIGHTS.groups.map(({ key, label }) =>
  '<button class="' + (opts.pillClass || 'pill') + ' lamp" data-light-group="' + key + '" role="switch" aria-checked="false" aria-label="' + label + '开关" disabled>' + label + '</button>'
).join('');
Object.values(extraLights).forEach(group => Object.assign(group, { on: false, lights: [], emitters: [] }));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const presets = {
  wildlife: { position: new THREE.Vector3(-11, 8, 17), target: new THREE.Vector3(-25, -.5, 5), fov: 48 },
  waterside: { position: b(18,-48,31), target: b(-17,16,2) },
  landscape: { position: b(32,-48,23), target: b(-7,16,7.5), fov: 42 },
  yard: { position: b(14,-8,14), target: b(4.5,4.8,1.3) },
  pond: { position: b(4.5,2.4,3.6), target: b(1.45,6.3,.03) },
  garden: { position: b(2,-1.5,6.2), target: b(7.45,4.6,1.6) },
  top: { position: b(4.5,3.8,21), target: b(4.5,4.5,0) },
  attic: { position: b(3.5,22.3,9.5), target: b(1,24.7,8.85), fov: 65, interior: true },
  lamp: { position: b(6.4,9.8,3.3), target: b(8.85,7.95,2.05) },
  entry: { position: b(7.5,8.3,3.1), target: b(4.5,13.12,2.35) },
  gate: { position: b(4.5,8.5,4.7), target: b(5.2,-.06,2.2) },
  terrace: { position: b(8,13.8,11.2), target: b(4.5,18,9.1) },
  atticDesk: { position: b(3.5,19.8,9.45), target: b(2.27,21.3,9.0), fov: 65, interior: true },
  atticFloor: { position: b(3.5,22.3,9.45), target: b(2.88,24.9,9.2), fov: 60, interior: true },
  balcony: { position: b(0.6,12.25,5.75), target: b(4.3,12.75,7.5), fov: 68, interior: true },
  rearDoor: { position: b(4.5,28.6,1.9), target: b(4.5,25.6,3.7), fov: 55 }
};
function fail(error) {
  console.error(error);
  $('#loading').hidden = false; $('#spinner').hidden = true; $('#progress').hidden = true;
  $('#load-title').textContent = '模型暂时无法打开';
  $('#load-message').textContent = `请确认已执行导出命令，并通过本地 HTTP 地址访问。${error.message || error}`;
  $('#retry').hidden = false;
}
function materialsOf(object) { return Array.isArray(object.material) ? object.material : object.material ? [object.material] : []; }
function dispose(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => { if (o.geometry) geometries.add(o.geometry); materialsOf(o).forEach(m => materials.add(m)); });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
function selectView(name, immediate = false) {
  activeView = name;
  root.querySelectorAll('[data-view]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.view === name)));
  let preset = presets[name];
  if (name === 'all' && fullBounds) {
    const size = fullBounds.getSize(new THREE.Vector3()), center = fullBounds.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 1.25;
    preset = { target: center, position: center.clone().add(new THREE.Vector3(.7,.7,1).normalize().multiplyScalar(radius)) };
  }
  if (!preset) return;
  const target = preset.target.clone();
  const position = preset.position.clone().sub(target).multiplyScalar(!preset.interior && camera.aspect < .9 ? 1.35 : 1).add(target);
  camera.fov = ['landscape', 'waterside'].includes(name) ? (camera.aspect < .9 ? 58 : 42) : (preset.fov || 40); camera.updateProjectionMatrix();
  controls.minDistance = preset.interior ? .2 : 1;
  if (immediate || reducedMotion || preset.interior) { camera.position.copy(position); controls.target.copy(target); controls.update(); transition = null; }
  else transition = { from: camera.position.clone(), to: position, fromTarget: controls.target.clone(), toTarget: target, start: performance.now() };
  dirty = true;
}
function resize() {
  camera.aspect = root.clientWidth / root.clientHeight; camera.updateProjectionMatrix();
  renderer.setSize(root.clientWidth, root.clientHeight); dirty = true;
}
function compass() {
  const arrow = $('#north-arrow');
  if (!arrow) return;
  const c = controls.target.clone().project(camera);
  const n = controls.target.clone().add(new THREE.Vector3(0,0,1)).project(camera);
  const angle = Math.atan2(n.x-c.x, n.y-c.y) * 180 / Math.PI;
  arrow.style.transform = `rotate(${angle}deg)`;
}
function toggleWireframe() {
  wireframe = !wireframe;
  $('#wireframe').setAttribute('aria-pressed', String(wireframe));
  if (model) model.traverse(o => materialsOf(o).forEach(m => { m.wireframe = wireframe; }));
  dirty = true;
}
function updateFloodlight(on) {
  floodlightOn = on;
  $('#floodlight').setAttribute('aria-checked', String(on));
  if (floodlight) { floodlight.visible = on; floodlight.intensity = on ? LIGHTS.floodlight.intensity : 0; }
  if (floodlightLens) materialsOf(floodlightLens).forEach(m => {
    m.color.set(on ? 0xffedc9 : 0xc1c7c7);
    m.emissive.set(on ? 0xffe2ab : 0x000000); m.emissiveIntensity = on ? 3 : 0;
  });
  dirty = true;
}
function rectangularLightProfile() {
  // Continuous rectangular falloff with a dim, broad spill component.
  // No flat bright plateau or sharp rectangle-to-black transition.
  const size = 256, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const horizontal = Math.abs((x + .5) / size * 2 - 1);
    const vertical = Math.abs((y + .5) / size * 2 - 1);
    const core = Math.exp(-.5 * ((horizontal / .45) ** 4 + (vertical / .26) ** 4));
    const spill = .10 * Math.exp(-.5 * ((horizontal / .72) ** 2 + (vertical / .48) ** 2));
    const coneFade = 1 - THREE.MathUtils.smoothstep(Math.hypot(horizontal, vertical), .8, 1);
    const mask = (core + spill) / 1.10 * coneFade;
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = Math.round(mask * 255); pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
function bindFloodlight() {
  if (floodlight) { scene.remove(floodlight, floodlight.target); floodlight.dispose(); floodlight = null; }
  floodlightLens = model.getObjectByName(LIGHTS.floodlight.lens);
  const housing = model.getObjectByName(LIGHTS.floodlight.housing);
  const available = Boolean(floodlightLens && housing);
  $('#floodlight').disabled = !available;
  if (!available) return;
  // Clone only the lens so changing emission never affects shared materials.
  floodlightLens.material = Array.isArray(floodlightLens.material) ? floodlightLens.material.map(m => m.clone()) : floodlightLens.material.clone();
  model.updateMatrixWorld(true);
  const lensPosition = floodlightLens.getWorldPosition(new THREE.Vector3());
  const direction = lensPosition.clone().sub(housing.getWorldPosition(new THREE.Vector3())).normalize();
  // Derive direction from exported fixture positions; no duplicated wall coordinates.
  // The cone encloses a wider rectangular profile; the map defines its edges.
  floodlight = new THREE.SpotLight(0xffe1ae, 0, 12, THREE.MathUtils.degToRad(45), 0, 2);
  floodlightProfile ||= rectangularLightProfile();
  floodlight.map = floodlightProfile;
  floodlight.position.copy(lensPosition).addScaledVector(direction, .015);
  floodlight.target.position.copy(floodlight.position).addScaledVector(direction, 12);
  floodlight.castShadow = true; floodlight.shadow.mapSize.set(1024, 1024);
  floodlight.shadow.camera.near = .025; floodlight.shadow.camera.far = 12;
  floodlight.shadow.bias = -.0001; floodlight.shadow.normalBias = .015;
  scene.add(floodlight, floodlight.target);
  updateFloodlight(floodlightOn);
}
function updateExtraLight(key, on) {
  const group = extraLights[key]; group.on = on;
  const button = $(`[data-light-group="${key}"]`);
  button.setAttribute('aria-checked', String(on));
  group.lights.forEach(light => { light.visible = on; light.intensity = on ? light.userData.baseIntensity : 0; });
  group.emitters.forEach(mesh => materialsOf(mesh).forEach(m => {
    m.color.set(on ? 0xffedcf : 0xc9cece);
    m.emissive.set(on ? 0xffe2b7 : 0x000000); m.emissiveIntensity = on ? 2.3 : 0;
  }));
  dirty = true;
}
function bindExtraLights() {
  model.updateMatrixWorld(true);
  for (const [key, group] of Object.entries(extraLights)) {
    group.lights.forEach(light => { scene.remove(light); if (light.target) scene.remove(light.target); light.dispose(); });
    group.lights = [];
    group.emitters = group.meshes.map(name => model.getObjectByName(name)).filter(Boolean);
    const available = group.emitters.length === group.meshes.length;
    const groupButton = document.querySelector('[data-light-group="' + key + '"]');
    if (groupButton) { groupButton.disabled = !available; groupButton.title = available ? '' : '当前模型缺少灯具，请重新导出'; }
    if (!available) continue;
    for (const mesh of group.emitters) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone();
      // Diffusers transmit their own lamp light instead of occluding it.
      mesh.castShadow = false;
      const bounds = new THREE.Box3().setFromObject(mesh);
      const center = bounds.getCenter(new THREE.Vector3()).add(group.offset);
      // Two samples along a broad LED panel approximate distributed emission
      // and keep the emitter outside the central opaque lamp stem.
      const positions = group.panel ? [-1,1].map(side => center.clone().add(new THREE.Vector3(bounds.getSize(new THREE.Vector3()).x * .3 * side,0,0))) : [center];
      for (const position of positions) {
        const light = group.type === 'spot'
          ? new THREE.SpotLight(0xffe6bf,0,group.range,THREE.MathUtils.degToRad(80),.85,2)
          : new THREE.PointLight(0xffe6bf,0,group.range,2);
        light.position.copy(position);
        light.userData.baseIntensity = group.intensity / positions.length;
        // Gate globe lights use diffuse fill; avoid two six-face shadow maps.
        light.castShadow = key !== 'gate';
        light.shadow.mapSize.set(key === 'entry' ? 1024 : 512, key === 'entry' ? 1024 : 512);
        light.shadow.camera.near = .02; light.shadow.camera.far = group.range;
        light.shadow.bias = -.0001; light.shadow.normalBias = .015;
        if (light.target) { light.target.position.copy(position).add(new THREE.Vector3(0,-4,0)); scene.add(light.target); }
        scene.add(light); group.lights.push(light);
      }
    }
    updateExtraLight(key, group.on);
  }
}
function clickLamp(event) {
  const start = pointerDown; pointerDown = null;
  if (!start || start.dragged || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 || !model) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  lampRaycaster.setFromCamera(pointer, camera);
  const hit = lampRaycaster.intersectObject(model, true)[0];
  // Use nearest visible surface: walls and other objects can occlude the lamp.
  if (!hit) return;
  if (hit.object.name.startsWith('Yard_West_Floodlight')) { updateFloodlight(!floodlightOn); return; }
  for (const [key, group] of Object.entries(extraLights)) {
    let object = hit.object;
    while (object && object !== model) {
      if (object.name === group.root || group.meshes.includes(object.name) || (group.prefix && object.name.startsWith(group.prefix))) {
        updateExtraLight(key, !group.on); return;
      }
      object = object.parent;
    }
  }
}
function applySun(instant = new Date()) {
  displayedInstant = instant;
  const { elevation, azimuth, direction: coordinates } = solarPosition(instant);
  const direction = new THREE.Vector3(...coordinates);
  const daylight = THREE.MathUtils.smoothstep(direction.y, 0, .4);
  const warmth = THREE.MathUtils.smoothstep(direction.y, 0, .65);
  sun.position.copy(sun.target.position).addScaledVector(direction, 55);
  sun.intensity = 2.6 * daylight;
  sun.color.set(0xffa563).lerp(new THREE.Color(0xfff1d9), warmth);
  hemisphere.intensity = .2 + daylight * .9;
  hemisphere.color.set(0x60758e).lerp(new THREE.Color(0xd9efff), daylight);
  hemisphere.groundColor.set(0x25313a).lerp(new THREE.Color(0xb2ad76), daylight);
  scene.environmentIntensity = .06 + daylight * .39;
  const twilight = THREE.MathUtils.smoothstep(elevation, -12, 0);
  scene.background.set(0x101c2b).lerp(new THREE.Color(0x8f9a9b), twilight)
    .lerp(new THREE.Color(0x86c7ee), THREE.MathUtils.smoothstep(elevation, 0, 20));
  scene.fog?.color.copy(scene.background);
  const clock = beijingClock(instant);
  if (document.activeElement !== $('#sun-datetime')) $('#sun-datetime').value = clock.dateTime;
  $('#sun-time').value = String(clock.minutes);
  $('#sun-time').setAttribute('aria-valuetext', clock.time);
  $('#sun-clock').value = clock.time;
  $('#sun-mode').textContent = followingRealtime ? '实时跟随' : '手动预览';
  $('#sun-live').setAttribute('aria-pressed', String(followingRealtime));
  $('#sun-position').textContent = elevation > 0
    ? `方位 ${azimuth.toFixed(1)}° · 高度 ${elevation.toFixed(1)}°`
    : elevation > -12 ? '晨昏 · 太阳在地平线下' : '夜间 · 太阳在地平线下';
  window.yardSunState = { mode: followingRealtime ? 'live' : 'manual', timestamp: instant.toISOString(), site: YARD_SITE, elevation, azimuth, direction: coordinates, intensity: sun.intensity };
  dirty = true;
}
function bindSunTime() {
  const signal = sunEvents.signal;
  const followNow = () => { followingRealtime = true; applySun(new Date()); };
  for (const selector of ['#sun-datetime', '#sun-time', '#sun-live']) $(selector).disabled = false;
  $('#sun-datetime').addEventListener('change', event => {
    if (!desktopSun.matches) return;
    const input = event.target;
    const instant = input.validity.valid && parseBeijingTime(input.value);
    if (!instant) { input.value = beijingClock(displayedInstant).dateTime; return; }
    followingRealtime = false; applySun(instant);
  }, { signal });
  $('#sun-time').addEventListener('input', event => {
    if (!desktopSun.matches) return;
    const minutes = Number(event.target.value);
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    const instant = parseBeijingTime(`${beijingClock(displayedInstant).date}T${hour}:${minute}`);
    if (instant) { followingRealtime = false; applySun(instant); }
  }, { signal });
  $('#sun-live').addEventListener('click', followNow, { signal });
  // Hiding the desktop controls also restores realtime on the mobile layout.
  desktopSun.addEventListener('change', () => { if (!desktopSun.matches) followNow(); }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && followingRealtime) applySun(new Date());
  }, { signal });
  // Recompute from the wall clock, never accumulate frame deltas or drift.
  sunTimer = window.setInterval(() => {
    if (followingRealtime && !document.hidden) applySun(new Date());
  }, 10_000);
}
async function loadModel(key) {
  const id = ++loadId, descriptor = models[key], start = performance.now();
  $('#loading').hidden = false; $('#spinner').hidden = false; $('#progress').hidden = false; $('#retry').hidden = true;
  $('#load-title').textContent = '正在打开院子'; $('#load-message').textContent = '读取模型与几何数据…';
  $('#progress-fill').style.width = '0%';
  $('#floodlight').disabled = true;
  const reportPromise = fetch(descriptor.report).then(r => r.ok ? r.json() : null).catch(() => null);
  try {
    const gltf = await new Promise((resolve, reject) => loader.load(descriptor.url, resolve, e => {
      if (id !== loadId) return;
      if (e.lengthComputable) { const progress = Math.round(e.loaded/e.total*100); $('#progress-fill').style.width = progress+'%'; $('#load-message').textContent = progress === 100 ? '模型已下载，正在解码…' : `正在读取 ${progress}%`; }
    }, reject));
    if (id !== loadId) { dispose(gltf.scene); return; }
    if (model) { scene.remove(model); dispose(model); }
    model = gltf.scene;
    model.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      materialsOf(o).forEach(m => { m.wireframe = wireframe; });
    });
    scene.add(model);
    bindFloodlight();
    bindExtraLights();
    // Frame the building rather than any outlying interior prop.
    const building = model.getObjectByName('____15') || model;
    fullBounds = new THREE.Box3().setFromObject(building);
    const report = await reportPromise;
    if (id !== loadId) return;
    let triangles = report?.glb?.triangles;
    if (!triangles) { triangles = 0; model.traverse(o => { if (o.isMesh) triangles += (o.geometry.index?.count || o.geometry.attributes.position.count)/3; }); }
    $('#loading').hidden = true;
    window.yardPreviewState = { loaded: true, model: key, triangles, images: report?.glb?.images, error: null };
  } catch (error) { if (id === loadId) { window.yardPreviewState = { loaded:false, error:String(error) }; fail(error); } }
}
let loader, landscape;
try {
  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7)); renderer.setSize(root.clientWidth, root.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  $('#stage').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('pointerdown', e => { pointerDown = e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; });
  renderer.domElement.addEventListener('pointermove', e => { if (pointerDown && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 5) pointerDown.dragged = true; });
  renderer.domElement.addEventListener('pointerup', clickLamp);
  renderer.domElement.addEventListener('pointercancel', () => { pointerDown = null; });
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(40, root.clientWidth / root.clientHeight, .05, 250);
  controls = new OrbitControls(camera,renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .075;
  controls.minDistance = 1; controls.maxDistance = 100; controls.maxPolarAngle = Math.PI*.495; controls.autoRotateSpeed = .45;
  controls.addEventListener('change', () => { dirty = true; });
  controls.addEventListener('start', () => { transition = null; });
  hemisphere = new THREE.HemisphereLight(0xe4ebef,0xafa48a,1.15); scene.add(hemisphere);
  const environment = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment,.04).texture;
  environment.dispose(); pmrem.dispose(); scene.environmentIntensity = .45;
  sun = new THREE.DirectionalLight(0xfff1d9,3.1); sun.target.position.copy(b(4.5,4.5,0)); sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-19,right:19,top:19,bottom:-19,near:1,far:90});
  sun.shadow.bias = -.00015; sun.shadow.normalBias = .025; scene.add(sun,sun.target);
  scene.background = new THREE.Color();
  scene.fog = new THREE.FogExp2(0x86c7ee, .0025);
  applySun(); bindSunTime();
  landscape = createYardEnvironment();
  scene.add(landscape.group);
  const draco = new DRACOLoader(); draco.setDecoderPath('/yard/draco/'); draco.setWorkerLimit(2);
  loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  let previous = performance.now(), wildlifeElapsed = 0;
  const wildlifeFrustum = new THREE.Frustum();
  const wildlifeProjection = new THREE.Matrix4();
  const wildlifeBounds = new THREE.Sphere(new THREE.Vector3(-21, 0, 6), 15);
  renderer.setAnimationLoop(now => {
    const delta = Math.min((now-previous)/1000,.1); previous = now;
    if (transition) {
      const t = Math.min(1,(now-transition.start)/650), e = t*t*(3-2*t);
      camera.position.lerpVectors(transition.from,transition.to,e); controls.target.lerpVectors(transition.fromTarget,transition.toTarget,e);
      dirty = true; if (t === 1) transition = null;
    }
    const changed = controls.update(delta);
    if (!reducedMotion && !document.hidden) {
      wildlifeElapsed += delta;
      if (wildlifeElapsed >= .05) {
        wildlifeProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        wildlifeFrustum.setFromProjectionMatrix(wildlifeProjection);
        if (camera.position.distanceTo(wildlifeBounds.center) < 100 && wildlifeFrustum.intersectsSphere(wildlifeBounds)) {
          landscape.updateWildlife(wildlifeElapsed); dirty = true;
        }
        wildlifeElapsed = 0;
      }
    }
    if (dirty || changed || controls.autoRotate) { renderer.render(scene,camera); compass(); dirty = false; }
  });
  onResize = () => resize();
  window.addEventListener('resize', onResize);
  root.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',()=>selectView(button.dataset.view)));
  $('#reset').addEventListener('click',()=>selectView(activeView));
  $('#rotate').addEventListener('click',()=> { controls.autoRotate = !controls.autoRotate; $('#rotate').setAttribute('aria-pressed',String(controls.autoRotate)); dirty = true; });
  $('#wireframe').addEventListener('click',toggleWireframe);
  $('#floodlight').addEventListener('click', () => updateFloodlight(!floodlightOn));
  root.querySelectorAll('[data-light-group]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.lightGroup; updateExtraLight(key, !extraLights[key].on);
  }));
    $('#retry').addEventListener('click',()=>loadModel('light'));
  selectView('landscape',true); loadModel('light');
} catch (error) { fail(error); }
  return {
    destroy() {
      window.clearInterval(sunTimer);
      sunEvents.abort();
      renderer?.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
      controls?.dispose();
      landscape?.dispose();
      renderer?.dispose();
      root.querySelector('canvas')?.remove();
    },
  };
}

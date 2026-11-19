import * as THREE from "three";
import { CLIMATE_MODEL, type ClimateState } from "./climate-state";

// Match the verified web preview's fitted outlet contour. These coordinates
// describe the model, not a guessed physical vane position reported by Xiaomi.
const PROFILE = [[.099, .001], [.138, .001], [.152, .003], [.169, .013], [.185, .029], [.196, .044], [.198, .051]] as const;

function fittedVane() {
  const shape = new THREE.Shape();
  shape.moveTo(-PROFILE[0][0], PROFILE[0][1]);
  for (const [depth, height] of PROFILE.slice(1)) shape.lineTo(-depth, height);
  for (const [depth, height] of [...PROFILE].reverse()) shape.lineTo(-depth, height + .0025);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: .730, bevelEnabled: false })
    .rotateY(Math.PI / 2).translate(-.365, 0, 0);
}

function localBounds(object: THREE.Object3D, unit: THREE.Object3D) {
  const inverse = unit.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)));
  });
  return bounds;
}

export function bindClimateModel(model: THREE.Object3D) {
  const unit = model.getObjectByName(CLIMATE_MODEL);
  const dial = unit?.getObjectByName(`${CLIMATE_MODEL}_Round_LED_Display`);
  const digits = unit?.getObjectByName(`${CLIMATE_MODEL}_Temperature_26_2`);
  const vane = unit?.getObjectByName(`${CLIMATE_MODEL}_Swing_Vane`) as THREE.Mesh | undefined;
  if (!unit || !dial || !digits || !vane?.isMesh || vane.parent !== unit) return null;
  unit.updateWorldMatrix(true, true);
  const bounds = localBounds(dial, unit);
  const digitBounds = localBounds(digits, unit);
  if (bounds.isEmpty() || digitBounds.isEmpty()) return null;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const side = Math.min(size.x, size.y) * .73;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(side, side), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, alphaTest: .04, depthWrite: false, toneMapped: false,
  }));
  screen.name = "AirConditionerLiveDisplay";
  screen.position.set(center.x, center.y, digitBounds.max.z + .0003);
  screen.visible = false;
  // The GLB contains decorative fixed digits. They must never be mistaken for
  // a live setpoint, including before login or before the first state snapshot.
  digits.visible = false;
  unit.add(screen);
  vane.updateMatrix();
  const oldGeometry = vane.geometry;
  vane.geometry = fittedVane().applyMatrix4(vane.matrix.clone().invert());
  oldGeometry.dispose();
  vane.castShadow = false;
  const hinge = new THREE.Vector3(0, PROFILE[0][1] + .00125, PROFILE[0][0]);
  const closedPosition = vane.position.clone();
  const closedRotation = vane.quaternion.clone();
  const axis = new THREE.Vector3(1, 0, 0);
  const rotation = new THREE.Quaternion();
  let state: ClimateState = {};
  let angle = 0;
  let previousSignature = "";

  return {
    unit,
    update(next: ClimateState) {
      state = { ...next };
      screen.visible = next.on === true && next.indicator === true && next.targetTemperature !== undefined;
      const signature = JSON.stringify([screen.visible, next.targetTemperature, next.mode, next.fanLevel, next.verticalSwing]);
      if (!screen.visible || signature === previousSignature) return;
      previousSignature = signature;
      ctx.clearRect(0, 0, 256, 256);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#eefaff";
      ctx.font = "600 102px ui-monospace, monospace";
      ctx.fillText(String(next.targetTemperature), 111, 102, 178);
      ctx.font = "500 32px sans-serif"; ctx.fillText("°C", 219, 89);
      ctx.fillStyle = next.mode === 5 ? "#ffd1a3" : "#b1ecff";
      ctx.font = "600 26px sans-serif";
      ctx.fillText(({ 2: "COOL", 3: "DRY", 4: "FAN", 5: "HEAT" } as Record<number, string>)[next.mode ?? 0] ?? "", 69, 177);
      ctx.fillStyle = "#eefaff";
      if (next.fanLevel === 0) ctx.fillText("AUTO", 190, 177);
      else if (next.fanLevel !== undefined) {
        for (let i = 0; i < 8; i++) {
          const height = 9 + i * 3;
          ctx.globalAlpha = i < next.fanLevel ? 1 : .23;
          ctx.fillRect(145 + i * 11, 191 - height, 6, height);
        }
        ctx.globalAlpha = 1;
      }
      if (next.verticalSwing) { ctx.font = "600 28px sans-serif"; ctx.fillText("↕", 128, 219); }
      texture.needsUpdate = true;
    },
    animate(now: number, delta: number, reducedMotion: boolean, active: boolean) {
      let target = state.on === true ? .50 : 0;
      if (active && state.on && state.verticalSwing && !reducedMotion) target += Math.sin(now / 500) * .23;
      const nextAngle = reducedMotion || !active ? target : THREE.MathUtils.damp(angle, target, 14, delta);
      if (Math.abs(nextAngle - angle) < .00001 && Math.abs(target - angle) < .0001) return false;
      angle = Math.abs(nextAngle - target) < .0001 ? target : nextAngle;
      rotation.setFromAxisAngle(axis, angle);
      vane.quaternion.copy(closedRotation).premultiply(rotation);
      vane.position.copy(closedPosition).sub(hinge).applyQuaternion(rotation).add(hinge);
      return active;
    },
    dispose() { texture.dispose(); }, // Scene disposal owns geometry/materials.
  };
}

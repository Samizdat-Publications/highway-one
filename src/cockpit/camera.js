// Head rig: seat position, mouse look with return-to-centre, quick-look keys, head motion from the
// suspension state (sprung-mass lag, engine shiver, ABS pulse), FOV.
import * as THREE from 'three';
import { clamp, lerp, damp, spring2, DEG } from '../units.js';

export function createCameraRig(camera, body, C) {
  const head = new THREE.Object3D(); head.position.set(C.eye.x, C.eye.y, C.eye.z); body.add(head);
  const pivot = new THREE.Object3D(); head.add(pivot); pivot.add(camera);
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  const S = { yaw: 0, pitch: 0, idle: 0, fov: C.fov, fovTarget: C.fov, seatY: 0, seatZ: 0, quick: 0, bobT: 0 };
  const yawS = { x: 0, v: 0 }, pitchS = { x: 0, v: 0 };
  let manualYaw = 0, manualPitch = 0;

  function update(dt, I, car, hooks = {}) {
    // look input
    if (I.lookDX || I.lookDY) {
      manualYaw = clamp(manualYaw - I.lookDX * 0.0022 * 57.3, -C.lookYawMax, C.lookYawMax);
      manualPitch = clamp(manualPitch - I.lookDY * 0.0022 * 57.3, C.lookPitchMin, C.lookPitchMax);
      S.idle = 0;
    } else S.idle += dt;
    // return to centre after a pause (only when not holding the mouse button)
    if (S.idle > C.returnDelay && !I.dragging && !hooks.holdLook) { manualYaw = damp(manualYaw, 0, 5, dt); manualPitch = damp(manualPitch, 0, 5, dt); }
    let targetYaw = manualYaw, targetPitch = manualPitch;
    if (I.quickLook === -1) targetYaw = 95; else if (I.quickLook === 1) targetYaw = -95; else if (I.quickLook === 2) targetYaw = 165;
    spring2(yawS, targetYaw, Math.PI * 2 * 2.2, 0.9, dt); spring2(pitchS, targetPitch, Math.PI * 2 * 2.2, 0.9, dt);
    S.yaw = yawS.x; S.pitch = pitchS.x;
    pivot.rotation.set(S.pitch * DEG, S.yaw * DEG, 0, 'YXZ');

    // head motion
    const B = car.S.body, E = car.S.engine, v = car.S.speed;
    S.bobT += dt;
    const shiver = E.running ? 0.0004 * Math.sin(S.bobT * Math.PI * 2 * 25) * (0.4 + 0.6 * clamp(1 - v / 3, 0, 1)) * (0.5 + E.rpm / 3000) : 0;
    const absPulse = car.S.abs.active ? 0.0005 * Math.sin(car.S.abs.phase * Math.PI * 2) : 0;
    const rough = v > 0.5 ? 0.0012 * Math.sin(S.bobT * 4.4) * Math.sin(S.bobT * 7.1) * clamp(v / 15, 0, 1.5) : 0;
    head.position.set(C.eye.x - B.rollOut * 0.15, C.eye.y + S.seatY - B.heaveOut * 0.5 + shiver + absPulse + rough, C.eye.z + S.seatZ - B.pitchOut * 0.10);
    // fov
    S.fov = damp(S.fov, S.fovTarget, 6, dt);
    if (Math.abs(camera.fov - S.fov) > 0.01) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
  }
  function lookAtCenter() { manualYaw = manualPitch = 0; yawS.x = yawS.v = pitchS.x = pitchS.v = 0; }
  return { S, head, pivot, update, lookAtCenter };
}

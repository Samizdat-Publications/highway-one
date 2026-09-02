// Pedals, gear shifter (PRND gate or H-pattern), handbrake lever — animated from the car state.
import * as THREE from 'three';
import { damp, DEG } from '../units.js';

export function buildControls(M, T, anchors, car) {
  const D = car.drivetrain.S;
  // ---- pedals
  const pedalAngle = { throttle: 0, brake: 0, clutch: 0 };
  // ---- shifter
  const base = anchors.shifter;
  const boot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.07, 14, 1, true), M.leatherBlack); boot.position.y = 0.035; base.add(boot);
  const lever = new THREE.Group(); base.add(lever);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.17, 10), M.chrome); stick.position.y = 0.085; lever.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), M.leatherBlack); knob.position.y = 0.175; knob.scale.set(1, 0.85, 1.1); lever.add(knob);
  const knobCap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 12), M.chrome); knobCap.position.y = 0.197; lever.add(knobCap);
  // gate label plate (canvas)
  const plateCanvas = document.createElement('canvas'); plateCanvas.width = 256; plateCanvas.height = 128;
  const plateTex = new THREE.CanvasTexture(plateCanvas); plateTex.colorSpace = THREE.SRGBColorSpace; plateTex.generateMipmaps = false; plateTex.minFilter = THREE.LinearFilter;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), new THREE.MeshStandardMaterial({ map: plateTex, emissiveMap: plateTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6 }));
  plate.rotation.x = -Math.PI / 2; plate.position.set(-0.10, 0.002, 0.0); base.add(plate);
  let plateMode = null;
  function drawPlate() {
    const g = plateCanvas.getContext('2d');
    g.fillStyle = '#101214'; g.fillRect(0, 0, 256, 128);
    g.font = '700 30px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (D.mode === 'auto') { ['P', 'R', 'N', 'D'].forEach((k, i) => { g.fillStyle = k === D.sel ? '#ffb347' : '#8a8f96'; g.fillText(k, 40 + i * 58, 64); }); }
    else { g.font = '700 22px "Segoe UI", Helvetica, Arial, sans-serif'; [['1', 30, 40], ['3', 128, 40], ['5', 226, 40], ['2', 30, 92], ['4', 128, 92], ['R', 226, 92]].forEach(([k, x, y]) => { const cur = (k === 'R' && D.gear === -1) || (k !== 'R' && Number(k) === D.gear); g.fillStyle = cur ? '#ffb347' : '#8a8f96'; g.fillText(k, x, y); }); }
    plateTex.needsUpdate = true;
  }
  // target lever pose per gear
  const cur = { tx: 0, tz: 0 }, pose = { x: 0, z: 0 };
  let phase = 'idle', lastKey = '';
  function targetPose() {
    if (D.mode === 'auto') { const i = ['P', 'R', 'N', 'D'].indexOf(D.sel); return { x: 0, z: -0.06 + i * 0.04 }; }
    const g = D.gear;
    if (g === 0) return { x: 0, z: 0 };
    if (g === -1) return { x: 0.045, z: 0.05 };
    const col = g <= 2 ? -0.045 : g <= 4 ? 0 : 0.045;
    return { x: col, z: g % 2 === 1 ? -0.05 : 0.05 };
  }
  // ---- handbrake
  const hb = anchors.handbrake;
  const hbLever = new THREE.Group(); hb.add(hbLever);
  const hbArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.22), M.dashDark); hbArm.position.z = -0.11; hbLever.add(hbArm);
  const hbGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), M.leatherBlack); hbGrip.rotation.x = Math.PI / 2; hbGrip.position.z = -0.20; hbLever.add(hbGrip);
  const hbBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), M.chrome); hbBtn.rotation.x = Math.PI / 2; hbBtn.position.z = -0.25; hbLever.add(hbBtn);
  hbLever.position.z = 0.12;
  let hbAngle = 0;

  function update(dt) {
    const S = car.S;
    for (const name of ['throttle', 'brake', 'clutch']) {
      const v = name === 'throttle' ? S.throttle : name === 'brake' ? S.brake : S.clutch;
      pedalAngle[name] = damp(pedalAngle[name], v, 25, dt);
      anchors.pedals[name].rotation.x = (22 + pedalAngle[name] * 18) * DEG;
    }
    // shifter: go through neutral between positions
    const key = D.mode + '|' + D.sel + '|' + D.gear;
    if (key !== lastKey) { lastKey = key; phase = 'toNeutral'; drawPlate(); }
    const tp = targetPose();
    let gx = tp.x, gz = tp.z;
    if (phase === 'toNeutral') { gx = D.mode === 'auto' ? 0 : 0; gz = D.mode === 'auto' ? tp.z : 0; if (Math.abs(pose.x - gx) < 0.004 && Math.abs(pose.z - gz) < 0.004) phase = 'toGear'; if (D.mode === 'auto') phase = 'toGear'; }
    pose.x = damp(pose.x, gx, 22, dt); pose.z = damp(pose.z, gz, 22, dt);
    lever.rotation.z = -pose.x / 0.05 * 12 * DEG; lever.rotation.x = pose.z / 0.06 * 14 * DEG;
    if (plateMode !== D.mode) { plateMode = D.mode; drawPlate(); }
    // handbrake
    hbAngle = damp(hbAngle, S.handbrake, 14, dt);
    hbLever.rotation.x = -hbAngle * 28 * DEG;
  }
  drawPlate();
  return { update, lever };
}

// Vehicle lights: headlight spots, brake/reverse point lights, dome light, lamp lens emissives, dash backlight.
import * as THREE from 'three';
import { damp, lerp } from '../units.js';

export function buildVehicleLights(exterior, anchors, car, game) {
  const root = exterior.root;
  const lamps = exterior.lamps;
  const heads = [];
  for (const x of [-0.62, 0.62]) {
    const s = new THREE.SpotLight(0xfff2dc, 0, 90, 0.48, 0.5, 2);
    s.position.set(x, 0.78, -2.2); s.castShadow = false;
    s.target.position.set(x * 0.6, -0.4, -30); root.add(s); root.add(s.target);
    heads.push(s);
  }
  const brake = new THREE.PointLight(0xff2010, 0, 9, 2); brake.position.set(0, 0.86, 3.3); root.add(brake);
  const reverse = new THREE.PointLight(0xffffff, 0, 7, 2); reverse.position.set(0, 0.82, 3.3); root.add(reverse);
  const dome = new THREE.PointLight(0xfff0d0, 0, 2.6, 2); anchors.domeLight.add(dome);
  const domeLens = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.08), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, emissive: 0xfff0d0, emissiveIntensity: 0, roughness: 0.6 }));
  domeLens.position.y = -0.008; anchors.domeLight.add(domeLens);
  const S = { headLevel: 0 };

  function update(dt, night) {
    const L = car.S.lights, on = game.ignitionOn || car.S.engine.running;
    const lowOn = on && L.low, highOn = on && L.high;
    const target = lowOn ? (highOn ? 1 : 0.5) : 0;
    S.headLevel = damp(S.headLevel, target, 12, dt);
    for (const h of heads) { h.intensity = lerp(0, highOn ? 16000 : 7500, Math.min(1, S.headLevel * 2)); h.angle = highOn ? 0.40 : 0.52; h.distance = highOn ? 180 : 100; h.visible = h.intensity > 1; }
    heads[0].target.position.set(-0.4, highOn ? 0.3 : -0.4, highOn ? -60 : -30); heads[1].target.position.set(0.4, highOn ? 0.3 : -0.4, highOn ? -60 : -30);
    lamps.headL.material.emissiveIntensity = lamps.headR.material.emissiveIntensity = lowOn ? (highOn ? 5 : 3) : 0;
    const tail = on && L.low ? 1.4 : 0, br = on && L.brake ? 4.5 : 0;
    lamps.tailL.material.emissiveIntensity = Math.max(tail, br);
    brake.intensity = on && L.brake ? 120 : 0; brake.visible = brake.intensity > 0;
    const rev = on && L.reverse;
    lamps.revL.material.emissiveIntensity = rev ? 3 : 0; reverse.intensity = rev ? 60 : 0; reverse.visible = rev;
    const blink = on && L.blinkOn;
    const sl = blink && (L.signal === 'L' || L.hazards), sr = blink && (L.signal === 'R' || L.hazards);
    for (const k of ['sigFL', 'sigRL', 'sideL']) lamps[k].material.emissiveIntensity = sl ? 3.5 : 0;
    for (const k of ['sigFR', 'sigRR', 'sideR']) lamps[k].material.emissiveIntensity = sr ? 3.5 : 0;
    dome.intensity = L.dome ? 18 : 0; dome.visible = L.dome; domeLens.material.emissiveIntensity = L.dome ? 2 : 0;
    game.dashDim = 1;
  }
  return { heads, brake, reverse, dome, update };
}

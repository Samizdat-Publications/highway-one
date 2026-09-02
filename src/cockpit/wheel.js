// Steering wheel mesh + rotation, column stalk flicks.
import * as THREE from 'three';
import { DEG, damp } from '../units.js';

export function buildWheel(M, anchors, C) {
  const spin = new THREE.Group(); anchors.wheelHub.add(spin);
  const R = C.wheelRadius;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.019, 14, 56), M.rep('leatherBlack', 8, 1));
  spin.add(rim);
  // thumb grips at 9 and 3
  for (const sgn of [-1, 1]) { const g = new THREE.Mesh(new THREE.TorusGeometry(R, 0.024, 10, 10, 0.55), M.leatherBlack); g.rotation.z = sgn > 0 ? -0.27 : Math.PI - 0.27; spin.add(g); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.05, 24), M.dashSoft); hub.rotation.x = Math.PI / 2; spin.add(hub);
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.02, 24), M.leatherBlack); horn.rotation.x = Math.PI / 2; horn.position.z = 0.03; spin.add(horn);
  const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 16), M.chrome); emblem.rotation.x = Math.PI / 2; emblem.position.z = 0.042; spin.add(emblem);
  const spoke = (ang, len) => { const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.034, 0.02), M.dashSoft); s.position.set(Math.cos(ang) * len / 2, Math.sin(ang) * len / 2, 0); s.rotation.z = ang; spin.add(s); return s; };
  spoke(0, R - 0.02); spoke(Math.PI, R - 0.02); spoke(-Math.PI / 2, R - 0.02);
  // trim on spokes
  for (const ang of [0, Math.PI]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.022), M.trim); t.position.set(Math.cos(ang) * 0.10, 0, 0.002); spin.add(t); }
  // centre marker on the rim (top)
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.041), M.rep('leatherTan', 1, 1)); mark.position.set(0, R, 0); spin.add(mark);
  spin.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false; } });

  const S = { stalkL: 0, stalkR: 0 };
  function update(dt, car) {
    spin.rotation.z = -car.S.steerWheelDeg * DEG;
    const L = car.S.lights;
    const tl = L.signal === 'L' ? 1 : L.signal === 'R' ? -1 : 0;
    S.stalkL = damp(S.stalkL, tl, 18, dt); anchors.stalkL.rotation.z = S.stalkL * 10 * DEG;
    S.stalkR = damp(S.stalkR, car.S.wipers.mode > 0 ? 1 : 0, 18, dt); anchors.stalkR.rotation.z = -S.stalkR * 8 * DEG;
  }
  return { spin, update };
}

// Wiper arms sweeping across the windshield plane, plus a droplet mask canvas that rain paints
// and the blades erase (rendered as a subtle overlay hugging the glass).
import * as THREE from 'three';
import { DEG, clamp } from '../units.js';

const MW = 512, MH = 256; // mask canvas

export function buildWipers(M, anchors, car) {
  // windshield plane frame: centre (0, 1.21, -0.60), tilted so the top leans back
  const ws = anchors.windshield;
  const frame = new THREE.Group(); frame.position.copy(ws.position); frame.rotation.copy(ws.rotation); ws.parent.add(frame);
  const W = 1.50, H = 0.78; // plane size
  const arms = [];
  const mkArm = (px, len) => {
    const piv = new THREE.Group(); piv.position.set(px, -H / 2 + 0.02, 0.012); frame.add(piv);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.014, 0.008), M.rubber); arm.position.x = len / 2; piv.add(arm);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.006), M.rubber); blade.position.set(len - 0.20, 0.0, -0.004); piv.add(blade);
    piv.traverse((o) => { o.frustumCulled = false; });
    return { piv, len, px, blade: 0.46 };
  };
  arms.push(mkArm(-0.48, 0.66), mkArm(0.16, 0.60));
  const REST = 8 * DEG, SWEEP = 78 * DEG;

  // droplet mask
  const canvas = document.createElement('canvas'); canvas.width = MW; canvas.height = MH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  overlay.position.z = 0.006; overlay.renderOrder = 5; overlay.frustumCulled = false; frame.add(overlay);
  const S = { rain: 0, phase: 0, moving: false, pauseT: 0, drops: 0, dirty: true, prevAngle: [REST, REST] };
  const toPx = (x) => ((x + W / 2) / W) * MW, toPy = (y) => ((H / 2 - y) / H) * MH;

  function paintDrops(dt, speed) {
    const rate = S.rain * (30 + speed * 3);
    S.drops += rate * dt;
    while (S.drops >= 1) {
      S.drops -= 1;
      const x = Math.random() * MW, y = Math.random() * MH, r = 1 + Math.random() * 2.2;
      g.fillStyle = `rgba(235,245,255,${0.35 + Math.random() * 0.5})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (Math.random() < 0.15) { g.fillStyle = 'rgba(200,215,230,0.25)'; g.fillRect(x - 0.5, y, 1, 4 + Math.random() * 10); }
      S.dirty = true;
    }
  }
  function eraseSector(i, a0, a1) {
    const A = arms[i];
    const cx = toPx(A.px), cy = toPy(-H / 2 + 0.02);
    const r0 = ((A.len - 0.20 - A.blade / 2) / W) * MW, r1 = ((A.len - 0.20 + A.blade / 2) / W) * MW;
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    g.beginPath();
    const lo = Math.min(a0, a1) - 0.02, hi = Math.max(a0, a1) + 0.02;
    g.arc(cx, cy, r1, -hi, -lo, false); g.arc(cx, cy, r0, -lo, -hi, true); g.closePath(); g.fill();
    g.restore(); S.dirty = true;
  }

  function update(dt) {
    const mode = car.S.wipers.mode;
    const speed = car.S.speed;
    paintDrops(dt, speed);
    // wiper timing
    let hz = mode === 3 ? 1.4 : mode === 2 ? 0.9 : mode === 1 ? 0.7 : 0;
    if (mode === 1) { if (!S.moving) { S.pauseT += dt; if (S.pauseT > 3) { S.pauseT = 0; S.moving = true; } } }
    else S.moving = mode > 0;
    if (S.moving && (mode > 0 || S.phase > 0.001)) {
      S.phase += hz * dt;
      if (S.phase >= 1) { S.phase = 0; if (mode === 1) S.moving = false; if (mode === 0) S.moving = false; }
    } else if (mode === 0 && S.phase > 0) { S.phase = Math.min(1, S.phase + 0.9 * dt); if (S.phase >= 1) S.phase = 0; }
    const ang = REST + SWEEP * (1 - Math.cos(S.phase * Math.PI * 2)) / 2;
    car.S.wipers.phase = S.phase; car.S.wipers.moving = S.moving || S.phase > 0;
    arms.forEach((A, i) => { A.piv.rotation.z = ang; if (Math.abs(ang - S.prevAngle[i]) > 0.002) { eraseSector(i, S.prevAngle[i], ang); S.prevAngle[i] = ang; } });
    if (S.dirty) { tex.needsUpdate = true; S.dirty = false; }
    overlay.visible = S.rain > 0.001 || S.phase > 0;
  }
  function setRain(v) { S.rain = clamp(v, 0, 1); if (v <= 0) { /* dries slowly */ } }
  // slow evaporation when it is not raining
  let evapT = 0;
  const _update = update;
  function updateAll(dt) {
    _update(dt);
    if (S.rain <= 0.001) { evapT += dt; if (evapT > 0.5) { evapT = 0; g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 0, MW, MH); g.restore(); tex.needsUpdate = true; } }
  }
  return { update: updateAll, setRain, S, arms, canvas };
}

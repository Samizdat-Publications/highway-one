// Instrument cluster: canvas face (redrawn at 10 Hz for the LCD/lamps), needle meshes with lag springs,
// backlight via emissive intensity at night.
import * as THREE from 'three';
import { clamp, lerp, spring2, DEG, fmtClock } from '../units.js';

const W = 1024, H = 512;
const SPEEDO = { cx: 262, cy: 268, r: 210, max: 160, sweep: 240 };
const TACH = { cx: 762, cy: 268, r: 210, max: 8, sweep: 240 };
const LAMPS = [
  // id, label glyph, colour, x, y
  ['signalL', '◀', '#37d66a', 470, 62], ['signalR', '▶', '#37d66a', 554, 62],
  ['high', '≡○', '#3d8bff', 512, 62],
  ['abs', 'ABS', '#ffb020', 448, 420], ['brake', '(!)', '#ff3030', 512, 420], ['engine', 'ENG', '#ffb020', 576, 420],
  ['oil', 'OIL', '#ff3030', 448, 460], ['bat', 'BAT', '#ff3030', 512, 460], ['belt', 'BELT', '#ff3030', 576, 460],
  ['fuel', 'FUEL', '#ffb020', 120, 430], ['temp', 'TEMP', '#ff3030', 904, 430], ['lights', '-○-', '#37d66a', 904, 470],
];

export function buildGauges(M, anchors, car, game) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.5, metalness: 0 });
  const PW = 0.40, PH = PW * H / W;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat); face.frustumCulled = false; anchors.cluster.add(face);
  const px = (x) => (x / W - 0.5) * PW, py = (y) => (0.5 - y / H) * PH;

  // needles
  const mkNeedle = (d, len) => {
    const piv = new THREE.Object3D(); piv.position.set(px(d.cx), py(d.cy), 0.004); anchors.cluster.add(piv);
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.004, len, 0.0025), M.needle); n.position.y = len / 2 - 0.006; piv.add(n);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.0025), M.needle); tail.position.y = -0.008; piv.add(tail);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 16), M.pianoBlack); cap.rotation.x = Math.PI / 2; cap.position.z = 0.002; piv.add(cap);
    piv.traverse((o) => { o.frustumCulled = false; });
    return piv;
  };
  const speedN = mkNeedle(SPEEDO, 0.058), tachN = mkNeedle(TACH, 0.058);
  const fuelN = mkNeedle({ cx: 120, cy: 388 }, 0.02), tempN = mkNeedle({ cx: 904, cy: 388 }, 0.02);
  const sp = { x: 0, v: 0 }, tp = { x: 0, v: 0 }, fp = { x: 0.7, v: 0 }, tmp = { x: 0, v: 0 };
  const angleFor = (d, v) => (-(d.sweep / 2) + (d.sweep * clamp(v, 0, d.max)) / d.max) * DEG; // start at −120°

  // ---------------------------------------------------------------- static face
  function dial(d, labelEvery, redFrom, unit) {
    g.save(); g.translate(d.cx, d.cy);
    const grad = g.createRadialGradient(0, 0, d.r * 0.2, 0, 0, d.r); grad.addColorStop(0, '#111214'); grad.addColorStop(1, '#040405');
    g.fillStyle = grad; g.beginPath(); g.arc(0, 0, d.r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2c2e33'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, d.r - 3, 0, Math.PI * 2); g.stroke();
    const a0 = (-90 - d.sweep / 2) * DEG;
    if (redFrom != null) { g.strokeStyle = 'rgba(220,40,30,0.85)'; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, d.r - 18, a0 + (d.sweep * redFrom / d.max) * DEG, a0 + d.sweep * DEG); g.stroke(); }
    const ticks = d.max * (unit === 'rpm' ? 10 : 1);
    for (let i = 0; i <= ticks; i++) {
      const v = i / (unit === 'rpm' ? 10 : 1);
      const a = a0 + (d.sweep * v / d.max) * DEG;
      const major = unit === 'rpm' ? i % 10 === 0 : i % labelEvery === 0, mid = unit === 'rpm' ? i % 5 === 0 : i % 10 === 0;
      const len = major ? 22 : mid ? 14 : 7;
      g.strokeStyle = major ? '#f2f0ea' : '#a9a7a0'; g.lineWidth = major ? 3.5 : 1.6;
      g.beginPath(); g.moveTo(Math.cos(a) * (d.r - 26), Math.sin(a) * (d.r - 26)); g.lineTo(Math.cos(a) * (d.r - 26 - len), Math.sin(a) * (d.r - 26 - len)); g.stroke();
      if (major) { g.fillStyle = '#f2f0ea'; g.font = '600 30px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), Math.cos(a) * (d.r - 74), Math.sin(a) * (d.r - 74)); }
    }
    g.fillStyle = '#9a9891'; g.font = '500 20px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'center';
    g.fillText(unit === 'rpm' ? 'RPM ×1000' : 'MPH', 0, d.r * 0.5);
    g.restore();
  }
  function smallDial(cx, cy, label, lo, hi, redHigh) {
    g.save(); g.translate(cx, cy);
    g.fillStyle = '#0a0b0d'; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2c2e33'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.stroke();
    const a0 = -150 * DEG, a1 = -30 * DEG;
    for (let i = 0; i <= 4; i++) { const a = a0 + (a1 - a0) * i / 4; g.strokeStyle = '#ddd'; g.lineWidth = i % 2 === 0 ? 3 : 1.5; g.beginPath(); g.moveTo(Math.cos(a) * 46, Math.sin(a) * 46); g.lineTo(Math.cos(a) * (i % 2 === 0 ? 34 : 39), Math.sin(a) * (i % 2 === 0 ? 34 : 39)); g.stroke(); }
    if (redHigh) { g.strokeStyle = '#e03020'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 46, a1 - 14 * DEG, a1); g.stroke(); }
    g.fillStyle = '#ddd'; g.font = '600 18px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(lo, Math.cos(a0) * 28, Math.sin(a0) * 28 + 4); g.fillText(hi, Math.cos(a1) * 28, Math.sin(a1) * 28 + 4);
    g.fillStyle = '#9a9891'; g.font = '500 15px "Segoe UI", Helvetica, Arial, sans-serif'; g.fillText(label, 0, 22);
    g.restore();
  }
  function drawStatic() {
    g.fillStyle = '#050506'; g.fillRect(0, 0, W, H);
    dial(SPEEDO, 20, null, 'mph'); dial(TACH, 1, 6.5, 'rpm');
    smallDial(120, 388, 'FUEL', 'E', 'F', false); smallDial(904, 388, 'TEMP', 'C', 'H', true);
    // LCD frame
    g.fillStyle = '#0c0f10'; roundRect(g, 424, 150, 176, 230, 14); g.fill();
    g.strokeStyle = '#26292e'; g.lineWidth = 3; roundRect(g, 424, 150, 176, 230, 14); g.stroke();
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  const staticCanvas = document.createElement('canvas'); staticCanvas.width = W; staticCanvas.height = H;
  drawStatic(); staticCanvas.getContext('2d').drawImage(canvas, 0, 0);

  // ---------------------------------------------------------------- dynamic part (LCD + lamps)
  const lampState = {};
  function drawDynamic() {
    g.drawImage(staticCanvas, 0, 0);
    const S = car.S, E = S.engine, D = S.drive;
    const on = E.running, lampsAll = !on && (E.cranking || game.ignitionOn);
    const L = S.lights;
    lampState.signalL = (L.signal === 'L' || L.hazards) && L.blinkOn;
    lampState.signalR = (L.signal === 'R' || L.hazards) && L.blinkOn;
    lampState.high = L.high; lampState.lights = L.low || L.high;
    lampState.abs = S.abs.active || lampsAll; lampState.brake = S.handbrake > 0.5 || lampsAll;
    lampState.engine = lampsAll; lampState.oil = lampsAll || (!on && game.ignitionOn); lampState.bat = lampsAll || (!on && game.ignitionOn);
    lampState.belt = !S.seatbelt && game.ignitionOn; lampState.fuel = S.fuelWarn; lampState.temp = E.temp > 108;
    for (const [id, glyph, color, x, y] of LAMPS) {
      const lit = !!lampState[id];
      g.fillStyle = lit ? color : '#1b1c1f';
      g.font = `700 ${glyph.length > 2 ? 18 : 26}px "Segoe UI", Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (lit) { g.shadowColor = color; g.shadowBlur = 14; }
      g.fillText(glyph, x, y); g.shadowBlur = 0;
    }
    // LCD
    const lcdOn = game.ignitionOn || on;
    g.fillStyle = lcdOn ? '#c8dfe6' : '#1a1f22';
    g.font = '700 60px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(lcdOn ? car.drivetrain.gearLabel() : '', 512, 195);
    g.font = '700 44px "Cascadia Mono", Consolas, monospace'; g.fillText(lcdOn ? String(Math.round(S.speedMph)) : '', 512, 246);
    g.font = '600 16px "Segoe UI", Helvetica, Arial, sans-serif'; g.fillStyle = lcdOn ? '#7d9299' : '#1a1f22'; g.fillText(lcdOn ? 'MPH' : '', 512, 272); g.fillStyle = lcdOn ? '#c8dfe6' : '#1a1f22';
    g.font = '500 20px "Segoe UI", Helvetica, Arial, sans-serif';
    if (D.mode === 'auto' && lcdOn) { const order = ['P', 'R', 'N', 'D']; g.font = '600 20px "Segoe UI", Helvetica, Arial, sans-serif'; order.forEach((k, i) => { g.fillStyle = k === D.sel ? '#c8dfe6' : '#3a4448'; g.fillText(k, 470 + i * 28, 296); }); }
    else if (lcdOn) { g.fillStyle = '#7d9299'; g.font = '600 18px "Segoe UI", Helvetica, Arial, sans-serif'; g.fillText(D.mode === 'manualH' ? 'MANUAL' : 'SEQ', 512, 296); }
    g.fillStyle = lcdOn ? '#c8dfe6' : '#1a1f22';
    g.font = '500 22px "Cascadia Mono", Consolas, monospace';
    g.fillText(lcdOn ? fmtClock(game.hour) : '', 512, 324);
    g.font = '500 20px "Cascadia Mono", Consolas, monospace';
    g.fillText(lcdOn ? `${Math.floor(S.odometer).toString().padStart(6, '0')} mi` : '', 512, 350);
    g.font = '500 17px "Cascadia Mono", Consolas, monospace';
    g.fillText(lcdOn ? `TRIP ${S.trip.toFixed(1)}` : '', 512, 372);
    tex.needsUpdate = true;
  }

  let acc = 0;
  function update(dt, night) {
    const S = car.S, E = S.engine;
    const on = game.ignitionOn || E.running;
    spring2(sp, on ? S.speedMph : 0, Math.PI * 2 * 5, 0.7, dt);
    spring2(tp, on ? E.rpm / 1000 : 0, Math.PI * 2 * 5, 0.7, dt);
    spring2(fp, on ? E.fuel : 0, Math.PI * 2 * 0.3, 1, dt);
    spring2(tmp, on ? clamp((E.temp - 40) / 90, 0, 1) : 0, Math.PI * 2 * 0.3, 1, dt);
    speedN.rotation.z = -angleFor(SPEEDO, sp.x);
    tachN.rotation.z = -angleFor(TACH, tp.x);
    fuelN.rotation.z = -((-60 + 120 * clamp(fp.x, 0, 1)) * DEG);
    tempN.rotation.z = -((-60 + 120 * clamp(tmp.x, 0, 1)) * DEG);
    mat.emissiveIntensity = on ? lerp(0.85, 1.1, night) * game.dashDim : 0;
    acc += dt; if (acc > 0.1) { acc = 0; drawDynamic(); }
  }
  drawDynamic();
  return { update, canvas, lampState, mat };
}

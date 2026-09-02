// In-dash navigation screen: a prerendered road map, heading-up crop with the car chevron,
// optional route polyline + turn prompt, street name, speed/limit, clock, mode objective.
import * as THREE from 'three';
import { fmtClock, fmtDist, clamp } from '../units.js';

const SW = 384, SH = 256;        // screen canvas
const MAP = 2048, MPP = 2;       // master map px, metres per px
const MX0 = -1024, MZ0 = -3000;  // world coords of the master map origin (top-left)

export function buildNav(M, anchors, roads, car, game) {
  // master map
  const master = document.createElement('canvas'); master.width = MAP; master.height = MAP;
  const mg = master.getContext('2d');
  const toMx = (x) => (x - MX0) / MPP, toMz = (z) => (z - MZ0) / MPP;
  function drawMaster() {
    mg.fillStyle = '#0d1418'; mg.fillRect(0, 0, MAP, MAP);
    // sea + beach hints
    mg.fillStyle = '#0f2a3a'; mg.fillRect(0, 0, toMx(-112), MAP);
    mg.fillStyle = '#1a2830'; mg.fillRect(toMx(-112), 0, toMx(-60) - toMx(-112), toMz(300));
    mg.lineCap = 'round'; mg.lineJoin = 'round';
    for (const pass of [0, 1]) for (const seg of roads.segments) {
      const w = (seg.hw * 2) / MPP;
      mg.strokeStyle = pass === 0 ? '#2b3a42' : seg.type === 'highway' ? '#d9c27a' : seg.type === 'avenue' ? '#e0d6b4' : seg.type === 'side' ? '#b9b39a' : '#a9b0b4';
      mg.lineWidth = pass === 0 ? w + 2 : Math.max(1.5, w * 0.8);
      mg.beginPath();
      seg.samples.forEach((s, i) => { const x = toMx(s.p.x), y = toMz(s.p.z); if (i === 0) mg.moveTo(x, y); else mg.lineTo(x, y); });
      mg.stroke();
    }
    for (const it of roads.intersections) { if (it.kind === 'signal') { mg.fillStyle = '#4ad66a'; mg.beginPath(); mg.arc(toMx(it.node.p.x), toMz(it.node.p.z), 2.2, 0, Math.PI * 2); mg.fill(); } }
  }
  drawMaster();

  // screen
  const canvas = document.createElement('canvas'); canvas.width = SW; canvas.height = SH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true });
  const PW = 0.27, PH = PW * SH / SW;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat); screen.frustumCulled = false; anchors.nav.add(screen);
  const S = { zoomIdx: 1, zooms: [0.45, 0.9, 2.2], route: null, nextTurn: null, objective: '', eta: '', poi: [] };
  let acc = 0;

  function draw() {
    const C = car.S;
    const mpp = S.zooms[S.zoomIdx];         // metres per screen pixel
    const on = game.ignitionOn || C.engine.running;
    g.fillStyle = '#06090b'; g.fillRect(0, 0, SW, SH);
    if (!on) { tex.needsUpdate = true; return; }
    // map crop: heading-up, car at (SW/2, SH*0.68)
    g.save(); g.beginPath(); g.rect(0, 22, SW, SH - 44); g.clip();
    g.translate(SW / 2, SH * 0.68); g.rotate(-C.yaw); // yaw positive = left turn (CCW from above); screen y is down → rotate(−yaw)
    const scale = MPP / mpp;
    g.scale(scale, scale);
    g.translate(-toMx(C.x), -toMz(C.z));
    g.drawImage(master, 0, 0);
    // route
    if (S.route && S.route.length > 1) { g.strokeStyle = '#3aa0ff'; g.lineWidth = 3 / scale + 1; g.lineCap = 'round'; g.beginPath(); S.route.forEach((p, i) => { const x = toMx(p.x), y = toMz(p.z); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }); g.stroke(); }
    for (const p of S.poi) { g.fillStyle = p.color || '#ff7a3c'; g.beginPath(); g.arc(toMx(p.x), toMz(p.z), 4 / scale + 1, 0, Math.PI * 2); g.fill(); }
    g.restore();
    // car chevron
    g.save(); g.translate(SW / 2, SH * 0.68); g.fillStyle = '#ffffff'; g.strokeStyle = '#3aa0ff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
    // top bar
    g.fillStyle = 'rgba(8,12,15,0.92)'; g.fillRect(0, 0, SW, 22);
    g.font = '600 13px "Segoe UI", Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#e6eef2'; g.textAlign = 'left';
    g.fillText((S.street || '').toUpperCase(), 8, 11);
    g.textAlign = 'right'; g.fillText(`${Math.round(C.speedMph)} MPH`, SW - 8, 11);
    g.fillStyle = C.speedMph > (S.limit || 99) + 5 ? '#ff5a4a' : '#8fa3ad'; g.font = '500 11px "Segoe UI", Helvetica, Arial, sans-serif';
    g.fillText(`LIMIT ${S.limit || '--'}`, SW - 72, 11);
    // bottom bar
    g.fillStyle = 'rgba(8,12,15,0.92)'; g.fillRect(0, SH - 22, SW, 22);
    g.fillStyle = '#e6eef2'; g.textAlign = 'left'; g.font = '600 12px "Segoe UI", Helvetica, Arial, sans-serif';
    if (S.nextTurn) { g.fillText(`${S.nextTurn.icon} ${S.nextTurn.text}  ${fmtDist(S.nextTurn.dist)}`, 8, SH - 11); }
    else g.fillText(S.objective || 'FREE ROAM', 8, SH - 11);
    g.textAlign = 'right'; g.fillStyle = '#8fa3ad'; g.font = '500 12px "Cascadia Mono", Consolas, monospace';
    g.fillText(`${S.eta ? S.eta + '  ' : ''}${fmtClock(game.hour)}`, SW - 8, SH - 11);
    // zoom hint
    g.fillStyle = '#5f7078'; g.font = '500 10px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.fillText(`${['ZOOM+', 'ZOOM', 'ZOOM-'][S.zoomIdx]}`, 8, 34);
    tex.needsUpdate = true;
  }
  function update(dt, here) {
    S.street = here.name; S.limit = here.limitMph;
    acc += dt; if (acc > 0.1) { acc = 0; draw(); }
  }
  function cycleZoom() { S.zoomIdx = (S.zoomIdx + 1) % S.zooms.length; draw(); }
  function setRoute(pts, nextTurn, eta) { S.route = pts; S.nextTurn = nextTurn; S.eta = eta || ''; }
  draw();
  return { S, update, cycleZoom, setRoute, canvas, master, draw };
}

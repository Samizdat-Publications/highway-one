// Pelican Point Pier — drivable deck with Pacific Park: entrance arch, carousel pavilion, arcade, food kiosks,
// Ferris wheel, a running roller coaster, a spinning ride, a drop tower, bait shop at the end, railings, lamps.
// The deck road itself is in the road graph (layout.js: pier ramp + deck + end loop); this file builds the
// structure around it and animates the rides.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../rng.js';

export const PIER = { z: 106, halfW: 15, x0: -88, x1: -412, deckY: 5.0, roadZ: 108 };

export function buildPier(scene, roads, terrain, M, T, collide, lighting) {
  const rng = createRng(0x9155);
  const G = new THREE.Group(); G.name = 'pier'; scene.add(G);
  const { z: PZ, halfW: HW, x0: X0, x1: X1, deckY: DY } = PIER;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const add = (mesh, parent = G) => { mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.enable(2); parent.add(mesh); return mesh; };
  const box = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return add(m, parent); };
  const label = (text, w, h, bg, fg, font = 46) => { const tex = T.canvasTex(512, Math.round(512 * h / w), (g, cw, ch) => { g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.fillStyle = fg; g.font = `800 ${font}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cw / 2, ch / 2); }, { wrap: false }); return std({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 }); };
  const emissives = [], rides = [];
  const signMat = (text, w, h, bg, fg, font) => { const m = label(text, w, h, bg, fg, font); emissives.push(m); return m; };

  // ------------------------------------------------------------------ deck + piles + railings
  const deckTex = T.canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#8a6f52'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 18) { g.fillStyle = `rgba(30,20,10,${0.3 + rng() * 0.25})`; g.fillRect(0, y, w, 3); g.fillStyle = `rgba(255,235,205,${rng() * 0.09})`; g.fillRect(0, y + 6, w, 5); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(rng() * w, y + 3, 1, 14); } } }, { repeat: [12, 80] });
  const deckMat = std({ map: deckTex, roughness: 0.9 });
  const deck = box(X0 - X1, 0.5, HW * 2, deckMat, (X0 + X1) / 2, DY - 0.28, PZ);
  const pileG = new THREE.CylinderGeometry(0.4, 0.45, 1, 8); const piles = [];
  for (let x = X0 - 3; x > X1; x -= 7) for (const dz of [-HW + 1.2, -HW / 2, 0, HW / 2, HW - 1.2]) { const gy = terrain.baseHeight(x, PZ + dz) - 1; const hh = DY - 0.5 - gy; piles.push(pileG.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, gy + hh / 2, PZ + dz), new THREE.Quaternion(), new THREE.Vector3(1, hh, 1)))); }
  add(new THREE.Mesh(mergeGeometries(piles), std({ color: 0x4a3f36, roughness: 1 })));
  // cross bracing under the deck (visible from the beach)
  const braceG = []; for (let x = X0 - 3; x > X1; x -= 14) braceG.push(new THREE.BoxGeometry(0.25, 0.25, HW * 2 - 2).translate(x, DY - 1.2, PZ));
  add(new THREE.Mesh(mergeGeometries(braceG), std({ color: 0x5a4a3c, roughness: 1 })));
  const railMat = std({ color: 0xe9e6dd, roughness: 0.7 });
  const railG = [];
  for (const side of [-1, 1]) {
    const zr = PZ + side * (HW - 0.35);
    for (let x = X0; x > X1; x -= 2.5) railG.push(new THREE.BoxGeometry(0.08, 1.15, 0.08).translate(x, DY + 0.58, zr));
    railG.push(new THREE.BoxGeometry(X0 - X1, 0.07, 0.07).translate((X0 + X1) / 2, DY + 1.12, zr), new THREE.BoxGeometry(X0 - X1, 0.05, 0.05).translate((X0 + X1) / 2, DY + 0.7, zr));
    collide.addBox((X0 + X1) / 2, zr, (X0 - X1) / 2, 0.2, 0, 'railing');
  }
  // end rail
  for (let z = PZ - HW; z <= PZ + HW; z += 2.5) railG.push(new THREE.BoxGeometry(0.08, 1.15, 0.08).translate(X1 + 0.3, DY + 0.58, z));
  railG.push(new THREE.BoxGeometry(0.07, 0.07, HW * 2).translate(X1 + 0.3, DY + 1.12, PZ));
  collide.addBox(X1 + 0.3, PZ, 0.2, HW, 0, 'railing');
  add(new THREE.Mesh(mergeGeometries(railG), railMat));

  // ------------------------------------------------------------------ entrance arch
  {
    const x = X0 + 2; const postMat = std({ color: 0x1f4e79, roughness: 0.6 });
    for (const dz of [-7.5, 7.5]) { const p = box(0.6, 8, 0.6, postMat, x, DY + 4, PZ + dz); collide.addCircle(x, PZ + dz, 0.5, 'arch'); }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.4), signMat('PELICAN POINT PIER  ·  SPORT FISHING  ·  CAFES  ·  PACIFIC PARK', 16, 2.4, '#1f4e79', '#fff4dc', 30));
    banner.position.set(x, DY + 8.2, PZ); banner.rotation.y = -Math.PI / 2; banner.material.side = THREE.DoubleSide; add(banner);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(8, 0.25, 8, 24, Math.PI), postMat); arc.position.set(x, DY + 8, PZ); arc.rotation.y = Math.PI / 2; add(arc);
  }

  // ------------------------------------------------------------------ carousel pavilion (south side near the entrance)
  {
    const cx = X0 - 34, cz = PZ - 8.5, r = 7;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 5, 8, 1), std({ color: 0xf2e3b6, roughness: 0.8 })); wall.position.set(cx, DY + 2.5, cz); add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r + 1.2, 4.2, 8), std({ color: 0xb23a2e, roughness: 0.7 })); roof.position.set(cx, DY + 7.1, cz); add(roof);
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2, 8), std({ color: 0xf2e3b6 })); cupola.position.set(cx, DY + 10, cz); add(cupola);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 8), std({ color: 0xb23a2e })); cap.position.set(cx, DY + 11.8, cz); add(cap);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const win = box(2.2, 2.2, 0.1, std({ color: 0x2a3a48, roughness: 0.2, emissive: 0xffd9a0, emissiveIntensity: 0 }), cx + Math.cos(a) * (r + 0.02), DY + 2.6, cz + Math.sin(a) * (r + 0.02)); win.rotation.y = -a + Math.PI / 2; emissives.push(win.material); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.4), signMat('CAROUSEL', 8, 1.4, '#b23a2e', '#fff4dc', 60)); sign.position.set(cx, DY + 5.8, cz + r + 0.3); add(sign);
    // the carousel itself (spinning horses) visible through an open arch on the deck side
    const car = new THREE.Group(); car.position.set(cx, DY + 0.3, cz); G.add(car);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.3, 24), std({ color: 0x7a4a2a })); add(plat, car);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const pole = box(0.06, 3, 0.06, M.chrome, Math.cos(a) * 3.8, 1.8, Math.sin(a) * 3.8, car); const horse = box(0.5, 0.7, 1.3, std({ color: [0xffffff, 0x2a4a8a, 0xd94f3a, 0xf4c95d][i % 4] }), Math.cos(a) * 3.8, 1.6, Math.sin(a) * 3.8, car); horse.rotation.y = -a; }
    collide.addCircle(cx, cz, r + 0.3, 'carousel');
    rides.push({ update: (dt) => { car.rotation.y += dt * 0.5; } });
  }

  // ------------------------------------------------------------------ arcade + kiosks (north strip)
  const kiosk = (x, w, name, color) => {
    const z = PZ + HW - 4.2;
    box(w, 3.2, 5, std({ color, roughness: 0.75 }), x, DY + 1.6, z);
    const awn = box(w + 0.6, 0.15, 1.6, std({ map: T.canvasTex(128, 64, (g, cw, ch) => { for (let i = 0; i < cw; i += 16) { g.fillStyle = i % 32 ? '#ffffff' : color === 0xd94f3a ? '#d94f3a' : '#2a6aa8'; g.fillRect(i, 0, 16, ch); } }, { repeat: [Math.max(1, Math.round(w / 2)), 1] }), roughness: 0.8 }), x, DY + 3.0, z - 3.2);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 0.9), signMat(name, w, 0.9, '#111a22', '#ffe08a', 44)); sign.position.set(x, DY + 3.7, z - 2.5); add(sign);
    collide.addBox(x, z, w / 2 + 0.2, 2.7, 0, 'kiosk');
  };
  kiosk(X0 - 30, 8, 'CHURROS', 0xd94f3a); kiosk(X0 - 46, 10, 'FUNNEL CAKES', 0x2a6aa8); kiosk(X0 - 66, 16, 'PLAYLAND ARCADE', 0x3a8ad9); kiosk(X0 - 92, 9, 'TICKETS', 0xd94f3a);
  kiosk(X0 - 140, 12, 'SEAFOOD GRILL', 0x2a6aa8); kiosk(X0 - 200, 9, 'ICE CREAM', 0xd94f3a); kiosk(X0 - 260, 11, 'SOUVENIRS', 0x2a6aa8);

  // ------------------------------------------------------------------ Pacific Park (south strip)
  const parkFloor = box(150, 0.1, HW - 5, std({ color: 0x5a6068, roughness: 0.9 }), X0 - 160, DY + 0.06, PZ - HW / 2 - 2.5);
  // Ferris wheel
  {
    const wx = X0 - 150, wz = PZ - 9, R = 12, wy = DY + 14.5;
    const wheel = new THREE.Group(); wheel.position.set(wx, wy, wz); G.add(wheel);
    const rimMat = std({ color: 0xf6f6f6, roughness: 0.5, metalness: 0.4 });
    for (const dz of [-1.3, 1.3]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.2, 8, 48), rimMat); rim.position.z = dz; add(rim, wheel); }
    const spokes = []; const NS = 16;
    for (let i = 0; i < NS; i++) { const a = (i / NS) * Math.PI * 2; for (const dz of [-1.3, 1.3]) spokes.push(new THREE.BoxGeometry(0.1, R, 0.1).translate(0, R / 2, dz).applyMatrix4(new THREE.Matrix4().makeRotationZ(a))); }
    add(new THREE.Mesh(mergeGeometries(spokes), rimMat), wheel);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 16).rotateX(Math.PI / 2), rimMat), wheel);
    const gondMats = [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d, 0xffd166].map((c) => std({ color: c, roughness: 0.5 }));
    const gondolas = [];
    for (let i = 0; i < NS; i++) { const a = (i / NS) * Math.PI * 2; const piv = new THREE.Group(); piv.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); const g = box(1.7, 1.5, 2.5, gondMats[i % 5], 0, -1.1, 0, piv); wheel.add(piv); gondolas.push(piv); }
    const bulbMat = std({ color: 0xfff1c0, emissive: 0xffd070, emissiveIntensity: 0, roughness: 0.4 });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 6, 5), bulbMat, NS * 7); const bm = new THREE.Matrix4();
    for (let i = 0; i < NS; i++) for (let k = 0; k < 7; k++) { const a = (i / NS) * Math.PI * 2, r = 2 + k * 1.5; bm.makeTranslation(Math.cos(a) * r, Math.sin(a) * r, 1.55); bulbs.setMatrixAt(i * 7 + k, bm); }
    bulbs.layers.enable(2); wheel.add(bulbs);
    for (const sgn of [-1, 1]) for (const dz of [-2.4, 2.4]) { const leg = box(0.5, Math.hypot(14.5, 7), 0.5, rimMat, wx + sgn * 3.5, DY + 7.2, wz + dz); leg.rotation.z = -sgn * Math.atan2(7, 14.5); }
    collide.addBox(wx, wz, 8.5, 3.5, 0, 'ferris');
    for (let i = 0; i < 4; i++) lighting.addSpot(wx + (i - 1.5) * 9, wy, wz + 3.5, 0xffd070, 70, 28, 'pier');
    let chase = 0;
    rides.push({ update: (dt, lit) => { wheel.rotation.z += dt * 0.12; for (const gd of gondolas) gd.rotation.z = -wheel.rotation.z; chase += dt * 3; bulbMat.emissiveIntensity = lit ? 2.2 + Math.sin(chase) * 1.2 : 0; } });
  }
  // roller coaster: closed loop along the south strip with hills; a 3-car train runs it
  {
    const cx = X0 - 220, cz = PZ - 9;
    const pts = [];
    const P = [[-45, 1.5, 3.5], [-30, 5, 4.5], [-15, 9.5, 3], [0, 3, 2.5], [15, 8, 4], [30, 2.5, 3.5], [45, 6, 2], [55, 1.5, -1], [45, 1.2, -4.5], [25, 4.5, -5], [5, 9, -4], [-15, 2.5, -5], [-35, 6.5, -4.2], [-50, 2, -2]];
    for (const [dx, dy, dz] of P) pts.push(new THREE.Vector3(cx + dx, DY + dy, cz + dz));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    const trackMat = std({ color: 0xd9402e, roughness: 0.5, metalness: 0.4 });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.22, 8, true), trackMat); add(tube);
    // rails: two thin tubes offset via a second curve approximation (scaled) — approximate with ties instead
    const ties = []; const N = 160;
    for (let i = 0; i < N; i++) { const t = i / N; const p = curve.getPointAt(t), tg = curve.getTangentAt(t); const yaw = Math.atan2(tg.x, tg.z); ties.push(new THREE.BoxGeometry(1.4, 0.08, 0.14).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(p.x, p.y - 0.18, p.z)); }
    add(new THREE.Mesh(mergeGeometries(ties), std({ color: 0xe8e2c8, roughness: 0.7 })));
    const sup = []; for (let i = 0; i < 40; i++) { const t = i / 40; const p = curve.getPointAt(t); const h = p.y - 0.3 - DY; if (h > 0.5) sup.push(new THREE.CylinderGeometry(0.12, 0.14, h, 6).translate(p.x, DY + h / 2, p.z)); }
    add(new THREE.Mesh(mergeGeometries(sup), std({ color: 0xf0f0f0, roughness: 0.6 })));
    const cars = []; for (let i = 0; i < 3; i++) { const c = box(1.2, 0.9, 1.8, std({ color: i === 0 ? 0x2a4a8a : 0xffd166, roughness: 0.4 }), 0, 0, 0); cars.push(c); }
    collide.addBox(cx + 5, cz, 58, 6.5, 0, 'coaster');
    let s = 0; const L = curve.getLength();
    rides.push({ update: (dt) => { if (!Number.isFinite(dt) || !(L > 1)) return; const p0 = curve.getPoint(((s % L) + L) % L / L); const v = 6 + Math.sqrt(Math.max(0, (DY + 10 - p0.y)) * 2 * 9.81) * 0.55; s = (((s + v * Math.min(dt, 0.5)) % L) + L) % L; if (!Number.isFinite(s)) s = 0; cars.forEach((c, i) => { const t = (((s - i * 2.2) % L) + L) % L / L; const p = curve.getPoint(t), tg = curve.getTangent(t); c.position.copy(p).y += 0.5; c.rotation.set(0, Math.atan2(tg.x, tg.z), 0, 'YXZ'); c.rotateX(-Math.asin(Math.max(-1, Math.min(1, tg.y)))); }); } });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), signMat('WEST COASTER', 9, 1.6, '#2a4a8a', '#ffe08a', 60)); sign.position.set(cx - 50, DY + 6.5, cz + 6.5); add(sign);
  }
  // spinning ride (scrambler) + drop tower
  {
    const sx = X0 - 300, sz = PZ - 9;
    const hub = new THREE.Group(); hub.position.set(sx, DY + 2.6, sz); G.add(hub);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 12), M.chrome), hub).position.y = -1.3;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const arm = box(6, 0.15, 0.15, std({ color: 0xffd166 }), Math.cos(a) * 3, 0, Math.sin(a) * 3, hub); arm.rotation.y = -a; const seat = box(1.2, 0.8, 1.2, std({ color: [0xe63946, 0x2a9d8f, 0x457b9d][i % 3] }), Math.cos(a) * 6, -0.8, Math.sin(a) * 6, hub); }
    collide.addCircle(sx, sz, 7, 'ride');
    rides.push({ update: (dt) => { hub.rotation.y += dt * 0.9; } });
    const tx = X0 - 330, tz = PZ - 6;
    box(0.9, 26, 0.9, std({ color: 0xf0f0f0, roughness: 0.5 }), tx, DY + 13, tz);
    const carriage = box(3.2, 1.6, 3.2, std({ color: 0xe63946 }), tx, DY + 4, tz);
    collide.addCircle(tx, tz, 2, 'tower');
    let tt = 0; rides.push({ update: (dt) => { tt += dt; const cyc = tt % 14; const y = cyc < 8 ? 3 + cyc * 2.6 : cyc < 8.6 ? 24 : Math.max(3, 24 - (cyc - 8.6) * 24); carriage.position.y = DY + y; } });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), signMat('PACIFIC PARK', 6, 1.2, '#f4a261', '#1b1b1b', 60)); sign.position.set(X0 - 118, DY + 5, PZ - 3.2); add(sign);
  }
  // bait shop + fishing deck at the end (inside the turnaround loop)
  {
    const bx = X1 + 26, bz = PZ - 1;
    box(7, 3.4, 6, std({ color: 0x4a7a9a, roughness: 0.8 }), bx, DY + 1.7, bz);
    box(8, 0.25, 7, std({ color: 0xf4f1de }), bx, DY + 3.5, bz);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), signMat('BAIT & TACKLE  ·  MARIASOL CANTINA', 6, 1, '#f4f1de', '#1f4e79', 34)); sign.position.set(bx, DY + 4.1, bz + 3.6); add(sign);
    collide.addBox(bx, bz, 3.6, 3.1, 0, 'baitshop');
  }
  // lamp posts along both edges + benches + trash cans
  const lampG = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6).translate(0, 2.1, 0), new THREE.SphereGeometry(0.3, 10, 8).translate(0, 4.4, 0)]);
  const lampMat = std({ color: 0xf0eee6, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.5 }); emissives.push(lampMat);
  const lamps = [];
  for (let x = X0 - 6; x > X1 + 4; x -= 22) for (const side of [-1, 1]) { const z = PZ + side * (HW - 1.3); lamps.push(lampG.clone().translate(x, DY, z)); lighting.addSpot(x, DY + 4.5, z, 0xffe8c0, 80, 24, 'street'); }
  add(new THREE.Mesh(mergeGeometries(lamps), lampMat));
  const benchG = mergeGeometries([new THREE.BoxGeometry(1.7, 0.06, 0.45).translate(0, 0.45, 0), new THREE.BoxGeometry(1.7, 0.4, 0.05).translate(0, 0.7, -0.22), new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(-0.75, 0.22, 0), new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0.75, 0.22, 0)]);
  const benches = []; for (let x = X0 - 16; x > X1 + 8; x -= 33) { benches.push(benchG.clone().translate(x, DY, PZ + HW - 1.9)); }
  add(new THREE.Mesh(mergeGeometries(benches), std({ color: 0x6a4a2a, roughness: 0.9 })));

  function update(dt, lit) { for (const r of rides) r.update(dt, lit); for (const m of emissives) m.emissiveIntensity = lit ? 1.6 : 0; }
  G.traverse((o) => { if (o.isMesh) o.layers.enable(2); });
  return { group: G, update };
}

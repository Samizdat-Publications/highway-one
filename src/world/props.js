// Street furniture: palms, street lights, signal poles + heads, stop / speed-limit signs, crosswalk decals,
// parked cars, benches, hydrants, bollards. Instanced where repeated; registers colliders + light-pool spots.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../rng.js';
import { makeCarGeometries } from './carshape.js';

export function buildProps(scene, roads, terrain, M, T, collide, lighting, signals) {
  const rng = createRng(0x5a17);
  const group = new THREE.Group(); scene.add(group);
  const buckets = new Map();
  const push = (mat, geo) => { if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push(geo); };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const place = (geo, x, y, z, yaw, s = 1) => geo.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s)));
  const groundY = (x, z) => { const r = roads.surfaceAt(x, z); return r.onRoad || r.seg ? r.height : terrain.heightAt(x, z); };
  // nudge a roadside position back along `back` (unit vector) until it is clear of every road surface
  const clearOfRoad = (pos, back) => { const p = pos.clone(); for (let i = 0; i < 10; i++) { const r = roads.surfaceAt(p.x, p.z); if (!r.onRoad && !r.inIntersection) return p; p.addScaledVector(back, 1.0); } return null; };

  // ------------------------------------------------------------------ materials
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.6, metalness: 0.7 });
  const lampHead = new THREE.MeshStandardMaterial({ color: 0xd9dde0, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.4 });
  const signalBody = new THREE.MeshStandardMaterial({ color: 0x1f2a1a, roughness: 0.7 });
  const trunkMat = new THREE.MeshStandardMaterial({ map: T.photoTex('palmbark', { repeat: [1, 3] }) || T.canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#7a5f45'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 14) { g.fillStyle = `rgba(40,25,15,${0.25 + Math.random() * 0.3})`; g.fillRect(0, y, w, 5); g.fillStyle = 'rgba(200,170,130,0.15)'; g.fillRect(0, y + 6, w, 3); } }, { repeat: [1, 3] }), roughness: 0.9 });
  const frondTex = T.canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#2f6b2a'; g.beginPath(); g.moveTo(0, h / 2);
    for (let x = 0; x <= w; x += 8) { const t = x / w; const half = (1 - t * t) * h * 0.46 + 1; g.lineTo(x, h / 2 - half); }
    for (let x = w; x >= 0; x -= 8) { const t = x / w; const half = (1 - t * t) * h * 0.46 + 1; g.lineTo(x, h / 2 + half); }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20,50,20,0.6)'; g.lineWidth = 1; for (let x = 8; x < w; x += 10) { g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 14, h / 2 - (1 - x / w) * h * 0.46); g.stroke(); g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 14, h / 2 + (1 - x / w) * h * 0.46); g.stroke(); }
    g.fillStyle = '#5a4a2a'; g.fillRect(0, h / 2 - 1.5, w, 3);
  }, { wrap: false });
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const carMats = [0xc8ccd0, 0x1c1f24, 0x8a1c1c, 0x2c4a8a, 0xe8e6df, 0x3f5f3a, 0x6f6f72, 0xb8742c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.5, envMapIntensity: 1.2 }));
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.1, metalness: 0.3 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xb8282a, roughness: 0.5 });
  const paintWhite = M.paintWhite;

  // ------------------------------------------------------------------ palms (instanced)
  const palmSpots = [];
  const addPalm = (x, z, h = 6 + rng() * 4) => { palmSpots.push({ x, z, h, yaw: rng() * Math.PI * 2, lean: (rng() - 0.5) * 0.12 }); collide.addCircle(x, z, 0.4, 'palm'); };
  // along Ocean Ave both sides, the beach edge and Pier Ave
  for (const seg of roads.segments) {
    if (seg.name === 'Ocean Ave') { for (let s = 12; s < seg.length - 12; s += 22) { const sm = roads.sampleAt(seg, s); for (const side of [-1, 1]) { const off = side * (seg.hw + 3.6); addPalm(sm.p.x + sm.n.x * off, sm.p.z + sm.n.z * off); } } }
    if (seg.name === 'Pier Ave' || seg.name === 'Seaview Ave' || seg.name === 'Palm Ave') { for (let s = 15; s < seg.length - 15; s += 26) { const sm = roads.sampleAt(seg, s); const off = -(seg.hw + 3.4); addPalm(sm.p.x + sm.n.x * off, sm.p.z + sm.n.z * off, 5 + rng() * 3); } }
  }
  for (let z = -240; z < 260; z += 18 + rng() * 14) addPalm(-58 - rng() * 12, z, 5 + rng() * 5);
  {
    const trunkG = new THREE.CylinderGeometry(0.13, 0.22, 1, 8, 1); trunkG.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkG, trunkMat, palmSpots.length);
    const frondG = new THREE.PlaneGeometry(2.6, 0.7, 6, 1);
    { const p = frondG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); const t = (x + 1.3) / 2.6; p.setY(i, p.getY(i) - t * t * 1.1 + 0.15); } frondG.translate(1.3, 0, 0); }
    const NF = 8;
    const fronds = new THREE.InstancedMesh(frondG, frondMat, palmSpots.length * NF);
    palmSpots.forEach((pm, i) => {
      const y = groundY(pm.x, pm.z);
      m4.compose(v.set(pm.x, y, pm.z), q.setFromEuler(e.set(pm.lean, pm.yaw, 0)), sc.set(1, pm.h, 1)); trunks.setMatrixAt(i, m4);
      const top = new THREE.Vector3(pm.x + Math.sin(pm.lean) * pm.h * 0.5, y + pm.h * 0.98, pm.z);
      for (let k = 0; k < NF; k++) { const a = pm.yaw + (k / NF) * Math.PI * 2 + rng() * 0.3; const tilt = -0.25 - rng() * 0.35; m4.compose(top, q.setFromEuler(e.set(0, a, tilt, 'YXZ')), sc.set(0.9 + rng() * 0.3, 1, 1)); fronds.setMatrixAt(i * NF + k, m4); }
    });
    trunks.castShadow = true; fronds.castShadow = true; trunks.computeBoundingSphere(); fronds.computeBoundingSphere();
    trunks.layers.enable(2); fronds.layers.enable(2); group.add(trunks, fronds);
  }

  // ------------------------------------------------------------------ street lights
  const poleG = new THREE.CylinderGeometry(0.07, 0.11, 8, 8); poleG.translate(0, 4, 0);
  const armG = new THREE.BoxGeometry(2.2, 0.08, 0.08); armG.translate(1.1, 7.9, 0);
  const headG = new THREE.BoxGeometry(0.7, 0.14, 0.3); headG.translate(2.0, 7.85, 0);
  const lampGeos = [], headGeos = [];
  const addStreetLight = (x, z, yawToRoad, warm = true) => {
    const y = groundY(x, z);
    lampGeos.push(place(poleG, x, y, z, yawToRoad), place(armG, x, y, z, yawToRoad));
    headGeos.push(place(headG, x, y, z, yawToRoad));
    const hx = x + Math.cos(yawToRoad) * 2.0, hz = z - Math.sin(yawToRoad) * 2.0;
    lighting.addSpot(hx, y + 7.6, hz, warm ? 0xffd9a0 : 0xdfe8ff, 180, 30, 'street');
    collide.addCircle(x, z, 0.16, 'pole');
  };
  for (const seg of roads.segments) {
    if (seg.type === 'lot') continue;
    const both = seg.type === 'avenue';
    const spacing = seg.type === 'avenue' ? 32 : seg.type === 'street' ? 38 : 0;
    if (!spacing) continue;
    for (let s = 16; s < seg.length - 12; s += spacing) {
      const sm = roads.sampleAt(seg, s);
      const sides = both ? [-1, 1] : [1];
      for (const side of sides) {
        const off = side * (seg.hw + 1.2);
        const x = sm.p.x + sm.n.x * off, z = sm.p.z + sm.n.z * off;
        // arm points back toward the road: yaw such that +x local → −side·n
        const dir = new THREE.Vector3(-sm.n.x * side, 0, -sm.n.z * side);
        addStreetLight(x, z, Math.atan2(-dir.z, dir.x));
      }
    }
  }
  // tunnel lamps (sodium) → spots only + small emissive fixtures
  for (const seg of roads.segments) if (seg.tunnelLamps) for (const p of seg.tunnelLamps) { lighting.addSpot(p.x, p.y, p.z, 0xffb060, 120, 22, 'tunnel'); headGeos.push(new THREE.BoxGeometry(0.4, 0.12, 1.2).translate(p.x, p.y + 0.3, p.z)); }
  if (lampGeos.length) { const m = new THREE.Mesh(mergeGeometries(lampGeos), poleMat); m.castShadow = true; m.layers.enable(2); group.add(m); }
  if (headGeos.length) { const m = new THREE.Mesh(mergeGeometries(headGeos), lampHead); m.layers.enable(2); group.add(m); }

  // ------------------------------------------------------------------ signal heads + stop signs + crosswalks
  const signalGeos = [];
  const stopTex = T.canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#c1121f'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const x = 64 + Math.cos(a) * 62, y = 64 + Math.sin(a) * 62; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#fff'; g.font = '800 34px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 66); }, { wrap: false });
  const stopMat = new THREE.MeshStandardMaterial({ map: stopTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 });
  const limitMats = new Map();
  const limitMat = (mph) => { if (!limitMats.has(mph)) limitMats.set(mph, new THREE.MeshStandardMaterial({ map: T.canvasTex(128, 160, (g, w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#111'; g.textAlign = 'center'; g.font = '700 18px Helvetica, Arial, sans-serif'; g.fillText('SPEED', 64, 36); g.fillText('LIMIT', 64, 58); g.font = '800 64px Helvetica, Arial, sans-serif'; g.fillText(String(mph), 64, 128); }, { wrap: false }), side: THREE.DoubleSide, roughness: 0.5 })); return limitMats.get(mph); };
  const signGeos = [], stopGeos = [], crosswalkGeos = [];
  const signPostG = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6); signPostG.translate(0, 1.2, 0);
  const crosswalkTex = T.canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e8e2c8'; for (let x = 8; x < w; x += 32) g.fillRect(x, 4, 16, h - 8); }, { wrap: false });
  const crosswalkMat = new THREE.MeshStandardMaterial({ map: crosswalkTex, transparent: true, alphaTest: 0.4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  for (const it of roads.intersections) {
    if (it.radius <= 0) continue;
    for (const ap of it.approaches) {
      const seg = ap.seg, hw = seg.hw;
      const sm = roads.sampleAt(seg, ap.stopS);
      const T0 = ap.travelT; // travel direction into the node
      const rightN = new THREE.Vector3(T0.x, 0, T0.z).cross(new THREE.Vector3(0, 1, 0)).normalize(); // right of travel
      const yawFacing = Math.atan2(T0.x, T0.z); // sign faces back toward arriving traffic
      // crosswalk across this approach, just beyond the stop line
      if (it.kind === 'signal' || (it.kind === 'stop4' && seg.type === 'street')) {
        const cw = new THREE.PlaneGeometry(hw * 2 - 0.5, 2.6).rotateX(-Math.PI / 2).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(T0.x, T0.z))).translate(sm.p.x + T0.x * 2.4, sm.p.y + 0.06, sm.p.z + T0.z * 2.4);
        crosswalkGeos.push(cw);
      }
      if (it.kind === 'signal') {
        // pole on the far-right corner with a mast arm over the road and a 3-lamp head facing this approach
        const far = it.node.p.clone().addScaledVector(T0, it.radius + 1.0).addScaledVector(rightN, hw + 1.6);
        const y = groundY(far.x, far.z);
        const pole = new THREE.CylinderGeometry(0.09, 0.13, 6.2, 8).translate(far.x, y + 3.1, far.z);
        const armLen = hw + 1.2;
        const arm = new THREE.BoxGeometry(armLen, 0.1, 0.1).translate(-armLen / 2, 0, 0);
        const yawArm = Math.atan2(-rightN.z, rightN.x); // arm points −right (over the road)
        arm.applyMatrix4(new THREE.Matrix4().makeRotationY(yawArm)).translate(far.x, y + 6.1, far.z);
        signalGeos.push(pole, arm);
        const headPos = far.clone().addScaledVector(rightN, -(hw * 0.55)); headPos.y = y + 5.4;
        const body = new THREE.BoxGeometry(0.36, 1.05, 0.3).applyMatrix4(new THREE.Matrix4().makeRotationY(yawFacing)).translate(headPos.x, headPos.y, headPos.z);
        signalGeos.push(body);
        const mats = it.signal.mats[ap.group];
        [['red', 0.33], ['yellow', 0], ['green', -0.33]].forEach(([c, dy]) => {
          const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16).rotateX(Math.PI / 2), mats[c]);
          lamp.position.set(headPos.x + T0.x * 0.17, headPos.y + dy, headPos.z + T0.z * 0.17); lamp.rotation.y = yawFacing; lamp.layers.enable(2); group.add(lamp);
        });
        collide.addCircle(far.x, far.z, 0.2, 'pole');
      } else if (ap.stopSign) {
        const pos0 = sm.p.clone().addScaledVector(rightN, hw + 1.0).addScaledVector(T0, -1.5);
        const pos = clearOfRoad(pos0, T0.clone().multiplyScalar(-1)); if (!pos) continue;
        const y = groundY(pos.x, pos.z);
        stopGeos.push(place(signPostG, pos.x, y, pos.z, 0));
        const face = new THREE.PlaneGeometry(0.76, 0.76).applyMatrix4(new THREE.Matrix4().makeRotationY(yawFacing + Math.PI)).translate(pos.x, y + 2.3, pos.z);
        signGeos.push({ geo: face, mat: stopMat });
        collide.addCircle(pos.x, pos.z, 0.1, 'sign');
      }
    }
  }
  // speed limit signs every ~320 m on highways/avenues (right side of the forward direction)
  for (const seg of roads.segments) {
    if (!(seg.type === 'highway' || seg.type === 'avenue' || seg.type === 'side')) continue;
    for (let s = 60; s < seg.length - 40; s += 320) for (const dir of [1, -1]) {
      const sm = roads.sampleAt(seg, dir === 1 ? s : seg.length - s);
      const off = dir * (seg.hw + 1.2);
      const x = sm.p.x + sm.n.x * off, z = sm.p.z + sm.n.z * off, y = groundY(x, z);
      if (roads.surfaceAt(x, z).onRoad) continue;
      if (seg.tunnel && sm.s > seg.tunnel[0] - 10 && sm.s < seg.tunnel[1] + 10) continue;
      if (seg.bridge && sm.s > seg.bridge[0] - 10 && sm.s < seg.bridge[1] + 10) continue;
      stopGeos.push(place(signPostG, x, y, z, 0));
      const yawFacing = Math.atan2(sm.t.x * dir, sm.t.z * dir);
      const face = new THREE.PlaneGeometry(0.6, 0.75).applyMatrix4(new THREE.Matrix4().makeRotationY(yawFacing + Math.PI)).translate(x, y + 2.2, z);
      signGeos.push({ geo: face, mat: limitMat(seg.limitMph) });
      collide.addCircle(x, z, 0.1, 'sign');
    }
  }
  if (signalGeos.length) { const m = new THREE.Mesh(mergeGeometries(signalGeos.map((g) => g.index ? g.toNonIndexed() : g)), signalBody); m.castShadow = true; m.layers.enable(2); group.add(m); }
  if (stopGeos.length) { const m = new THREE.Mesh(mergeGeometries(stopGeos.map((g) => g.index ? g.toNonIndexed() : g)), poleMat); m.layers.enable(2); group.add(m); }
  { const byMat = new Map(); for (const s of signGeos) { if (!byMat.has(s.mat)) byMat.set(s.mat, []); byMat.get(s.mat).push(s.geo.index ? s.geo.toNonIndexed() : s.geo); } for (const [mat, geos] of byMat) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.layers.enable(2); group.add(m); } }
  if (crosswalkGeos.length) { const m = new THREE.Mesh(mergeGeometries(crosswalkGeos.map((g) => g.index ? g.toNonIndexed() : g)), crosswalkMat); m.renderOrder = 2; m.layers.enable(2); group.add(m); }

  // ------------------------------------------------------------------ parked cars (instanced per colour)
  const CG = makeCarGeometries(1.76);
  const bodyG = CG.bodyG, cabinG = CG.glassG, wheelG = CG.wheelG;
  const parked = [];
  for (const seg of roads.segments) {
    if (!seg.parking) continue;
    for (let s = 12; s < seg.length - 12; s += 8.5 + rng() * 4) {
      if (rng() > 0.55) continue;
      const sm = roads.sampleAt(seg, s);
      for (const side of [-1, 1]) {
        if (rng() > 0.6) continue;
        const off = side * (seg.hw - 1.25);
        const x = sm.p.x + sm.n.x * off, z = sm.p.z + sm.n.z * off;
        const yaw = Math.atan2(-sm.t.x * side, -sm.t.z * side); // parked facing the traffic direction of that side
        parked.push({ x, z, yaw, y: sm.p.y, color: Math.floor(rng() * carMats.length) });
        collide.addBox(x, z, 0.88, 2.15, yaw, 'parkedCar');
      }
    }
  }
  const byColor = new Map();
  for (const p of parked) { if (!byColor.has(p.color)) byColor.set(p.color, []); byColor.get(p.color).push(p); }
  for (const [ci, list] of byColor) {
    const bodies = new THREE.InstancedMesh(bodyG, carMats[ci], list.length), cabins = new THREE.InstancedMesh(cabinG, glassMat, list.length), wheels = new THREE.InstancedMesh(wheelG, M.tyre, list.length * 4);
    list.forEach((p, i) => {
      q.setFromEuler(e.set(0, p.yaw, 0)); m4.compose(v.set(p.x, p.y, p.z), q, sc.set(1, 1, 1)); bodies.setMatrixAt(i, m4); cabins.setMatrixAt(i, m4);
      CG.wheelOffsets.forEach(([wx, wz], k) => { const lx = wx * Math.cos(p.yaw) + wz * Math.sin(p.yaw), lz = -wx * Math.sin(p.yaw) + wz * Math.cos(p.yaw); m4.compose(v.set(p.x + lx, p.y + 0.31, p.z + lz), q, sc); wheels.setMatrixAt(i * 4 + k, m4); });
    });
    for (const im of [bodies, cabins, wheels]) { im.castShadow = true; im.computeBoundingSphere(); im.layers.enable(2); group.add(im); }
  }

  // ------------------------------------------------------------------ benches, hydrants, bollards along the beachfront
  const benchG = mergeGeometries([new THREE.BoxGeometry(1.6, 0.06, 0.45).translate(0, 0.45, 0), new THREE.BoxGeometry(1.6, 0.4, 0.05).translate(0, 0.7, -0.22), new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(-0.7, 0.22, 0), new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0.7, 0.22, 0)]);
  const benchGeos = [], hydrantGeos = [];
  for (let z = -230; z < 250; z += 45) { const x = -55; const y = groundY(x, z); benchGeos.push(place(benchG, x, y, z, Math.PI / 2)); }
  const hydrantG = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.14, 0.7, 8).translate(0, 0.35, 0), new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.72, 0), new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6).rotateZ(Math.PI / 2).translate(0, 0.5, 0)]);
  for (const seg of roads.segments) if (seg.type === 'street' && rng() < 0.5) { const sm = roads.sampleAt(seg, 20 + rng() * (seg.length - 40)); const x = sm.p.x + sm.n.x * (seg.hw + 0.7), z = sm.p.z + sm.n.z * (seg.hw + 0.7); hydrantGeos.push(place(hydrantG, x, groundY(x, z), z, 0)); collide.addCircle(x, z, 0.15, 'hydrant'); }
  if (benchGeos.length) { const m = new THREE.Mesh(mergeGeometries(benchGeos), woodMat); m.castShadow = true; m.layers.enable(2); group.add(m); }
  if (hydrantGeos.length) { const m = new THREE.Mesh(mergeGeometries(hydrantGeos), redMat); m.layers.enable(2); group.add(m); }

  return { group, lampHead, palmSpots, parked };
}

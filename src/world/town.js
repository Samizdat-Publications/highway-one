// Pelican Point buildings (facade canvases, lit windows at night), the pier with its Ferris wheel,
// lifeguard towers and the beach boardwalk. Registers colliders and light-pool spots.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../rng.js';
import { TOWN } from './layout.js';

export function buildTown(scene, roads, terrain, M, T, collide, lighting) {
  const rng = createRng(0x7e11);
  const group = new THREE.Group(); scene.add(group);
  const groundY = (x, z) => { const r = roads.surfaceAt(x, z); return r.onRoad || r.seg ? r.height : terrain.heightAt(x, z); };

  // ------------------------------------------------------------------ facade styles
  const palettes = [
    { wall: '#f1e9d8', trim: '#c9b99a', win: '#233140', name: 'cream' }, { wall: '#e9c9b3', trim: '#b98a6b', win: '#1f2a33', name: 'coral' },
    { wall: '#cfe3df', trim: '#7fa8a2', win: '#1a2833', name: 'teal' }, { wall: '#f6f3ee', trim: '#8d9aa6', win: '#202b36', name: 'white' },
    { wall: '#d8c3a5', trim: '#8b6f47', win: '#26303a', name: 'sand' }, { wall: '#b9c4cc', trim: '#5f6b73', win: '#161f28', name: 'grey' },
  ];
  const styles = palettes.map((p, si) => {
    const day = T.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = p.wall; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`; g.fillRect(rng() * w, rng() * h, 2, 2); }
      // 4 window columns × 4 floors per tile; ground floor = storefront strip at the bottom
      for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
        const x = 24 + fx * 122, y = 30 + fy * 122;
        if (fy === 3) continue;
        g.fillStyle = p.trim; g.fillRect(x - 6, y - 6, 88, 96);
        g.fillStyle = p.win; g.fillRect(x, y, 76, 84);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 4, y + 4, 30, 36);
        g.fillStyle = p.trim; g.fillRect(x + 36, y, 4, 84); g.fillRect(x, y + 40, 76, 4);
      }
      // storefront: awning + big window + door
      const gy = 30 + 3 * 122;
      g.fillStyle = si % 2 ? '#8a2a2a' : '#2a5a7a'; g.fillRect(0, gy - 26, w, 20);
      for (let x = 0; x < w; x += 40) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, gy - 26, 20, 20); }
      g.fillStyle = p.win; g.fillRect(20, gy, 300, 90); g.fillStyle = 'rgba(200,220,240,0.25)'; g.fillRect(24, gy + 4, 140, 40);
      g.fillStyle = '#4a3a2a'; g.fillRect(360, gy, 60, 100);
      g.fillStyle = p.trim; g.fillRect(0, gy + 100, w, 12);
    });
    const night = T.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let fy = 0; fy < 3; fy++) for (let fx = 0; fx < 4; fx++) { if (rng() < 0.45) { const x = 24 + fx * 122, y = 30 + fy * 122; g.fillStyle = rng() < 0.5 ? '#ffd9a0' : '#e8f0ff'; g.fillRect(x, y, 76, 84); } }
      const gy = 30 + 3 * 122; g.fillStyle = '#ffe3b0'; g.fillRect(20, gy, 300, 90);
    });
    return { day, night, mat: new THREE.MeshStandardMaterial({ map: day, emissiveMap: night, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 }) };
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 1 });
  const parapetMat = new THREE.MeshStandardMaterial({ color: 0xb9ae9a, roughness: 0.9 });
  const buckets = new Map();
  const push = (mat, geo) => { if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };

  // building: 4 wall planes with UV repeats matching 4 m columns / 3.4 m floors, roof + parapet
  function building(x0, z0, w, d, floors, style) {
    const y = groundY(x0 + w / 2, z0 + d / 2) + 0.02;
    const fh = 3.4, h = floors * fh;
    const mkWall = (cx, cz, len, yaw) => {
      const g = new THREE.PlaneGeometry(len, h);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 16), (1 - uv.getY(i)) * (floors / 4) * -1 + 1 - (1 - floors / 4) * 0); // v: bottom of texture = ground floor
      // simpler: v from (1 - floors/4) at bottom to 1 at top → tile every 4 floors
      for (let i = 0; i < uv.count; i++) { const v = g.attributes.position.getY(i) / h + 0.5; uv.setY(i, 1 - floors / 4 + v * (floors / 4)); }
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(cx, y + h / 2, cz);
      return g;
    };
    push(styles[style].mat, mkWall(x0 + w / 2, z0 + d, w, 0));               // south face (+z) faces +z
    push(styles[style].mat, mkWall(x0 + w / 2, z0, w, Math.PI));             // north face
    push(styles[style].mat, mkWall(x0 + w, z0 + d / 2, d, Math.PI / 2));     // east face
    push(styles[style].mat, mkWall(x0, z0 + d / 2, d, -Math.PI / 2));        // west face
    push(roofMat, new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x0 + w / 2, y + h, z0 + d / 2));
    push(parapetMat, new THREE.BoxGeometry(w + 0.3, 0.6, 0.3).translate(x0 + w / 2, y + h + 0.3, z0 + 0.0));
    push(parapetMat, new THREE.BoxGeometry(w + 0.3, 0.6, 0.3).translate(x0 + w / 2, y + h + 0.3, z0 + d));
    push(parapetMat, new THREE.BoxGeometry(0.3, 0.6, d).translate(x0, y + h + 0.3, z0 + d / 2));
    push(parapetMat, new THREE.BoxGeometry(0.3, 0.6, d).translate(x0 + w, y + h + 0.3, z0 + d / 2));
    if (rng() < 0.5) push(roofMat, new THREE.BoxGeometry(2, 1.2, 1.6).translate(x0 + 3 + rng() * (w - 6), y + h + 0.6, z0 + 3 + rng() * (d - 6)));
    collide.addBox(x0 + w / 2, z0 + d / 2, w / 2, d / 2, 0, 'building');
  }

  // ------------------------------------------------------------------ blocks
  const xs = [TOWN.oceanAveX, ...TOWN.nsStreets.map((n) => n[0])];
  const zs = TOWN.ewStreets.map((e) => e[0]);
  const hwStreet = 5.5 + 2.4 + 1.2, hwAve = 7.8 + 2.4 + 1.2;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const bx0 = xs[i] + (i === 0 ? hwAve : hwStreet), bx1 = xs[i + 1] - hwStreet;
    const bz0 = zs[j] + hwStreet, bz1 = zs[j + 1] - hwStreet;
    const bw = bx1 - bx0, bd = bz1 - bz0;
    // split the block into 2–3 lots along x and 2 along z with alleys
    const nx = 2 + (rng() < 0.5 ? 1 : 0), nz = 2;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      if (rng() < 0.12) continue; // empty lot / parking
      const lw = bw / nx, ld = bd / nz;
      const gap = 1.5 + rng() * 2;
      const w = lw - gap - rng() * 6, d = ld - gap - rng() * 6;
      const x0 = bx0 + a * lw + gap / 2 + rng() * 2, z0 = bz0 + b * ld + gap / 2 + rng() * 2;
      const nearOcean = i === 0;
      const floors = nearOcean ? (rng() < 0.3 ? 5 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3)) : 1 + Math.floor(rng() * 3);
      building(x0, z0, Math.max(8, w), Math.max(8, d), floors, Math.floor(rng() * styles.length));
    }
  }
  for (const [mat, geos] of buckets) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = true; m.receiveShadow = true; m.layers.enable(2); group.add(m); }

  // ------------------------------------------------------------------ pier
  const pier = new THREE.Group(); group.add(pier);
  const deckY = 5.0, pz = 115, pw = 18, px0 = -66, px1 = -390;
  const deckTex = T.canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#8a6a48'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = `rgba(30,20,10,${0.25 + rng() * 0.25})`; g.fillRect(0, y, w, 3); g.fillStyle = `rgba(255,230,200,${rng() * 0.08})`; g.fillRect(0, y + 6, w, 4); } }, { repeat: [8, 40] });
  const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(px0 - px1, 0.5, pw), deckMat); deck.position.set((px0 + px1) / 2, deckY, pz); deck.receiveShadow = true; deck.castShadow = true; deck.layers.enable(2); pier.add(deck);
  // ramp from the lot up to the deck
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 6), deckMat); ramp.position.set(px0 + 6, (deckY + 2.2) / 2 + 0.6, pz); ramp.rotation.z = Math.atan2(deckY - 2.2, 14); ramp.layers.enable(2); pier.add(ramp);
  const pileG = new THREE.CylinderGeometry(0.35, 0.4, 1, 8);
  const piles = [];
  for (let x = px0 - 4; x > px1; x -= 8) for (const dz of [-pw / 2 + 1, 0, pw / 2 - 1]) { const gy = terrain.baseHeight(x, pz + dz); const h = deckY - gy; piles.push(pileG.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, gy + h / 2, pz + dz), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)))); }
  const pileMesh = new THREE.Mesh(mergeGeometries(piles), new THREE.MeshStandardMaterial({ color: 0x4a3f36, roughness: 1 })); pileMesh.layers.enable(2); pier.add(pileMesh);
  // railings + lamps along both edges
  const railGeos = [];
  for (let x = px0; x > px1; x -= 3) for (const dz of [-pw / 2 + 0.3, pw / 2 - 0.3]) railGeos.push(new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(x, deckY + 0.8, pz + dz));
  for (const dz of [-pw / 2 + 0.3, pw / 2 - 0.3]) railGeos.push(new THREE.BoxGeometry(px0 - px1, 0.06, 0.06).translate((px0 + px1) / 2, deckY + 1.3, pz + dz));
  const railMesh = new THREE.Mesh(mergeGeometries(railGeos), new THREE.MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.7 })); railMesh.layers.enable(2); pier.add(railMesh);
  const lampG = mergeGeometries([new THREE.CylinderGeometry(0.06, 0.08, 4, 6).translate(0, 2, 0), new THREE.SphereGeometry(0.28, 10, 8).translate(0, 4.2, 0)]);
  const pierLamps = [];
  for (let x = px0 - 10; x > px1; x -= 24) for (const dz of [-pw / 2 + 0.9, pw / 2 - 0.9]) { pierLamps.push(lampG.clone().translate(x, deckY + 0.25, pz + dz)); lighting.addSpot(x, deckY + 4.3, pz + dz, 0xffe8c0, 90, 22, 'street'); }
  const pierLampMat = new THREE.MeshStandardMaterial({ color: 0xf0eee6, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.5 });
  const pierLampMesh = new THREE.Mesh(mergeGeometries(pierLamps), pierLampMat); pierLampMesh.layers.enable(2); pier.add(pierLampMesh);
  // kiosks along the deck
  const kioskMat = new THREE.MeshStandardMaterial({ color: 0xd94f3a, roughness: 0.7 });
  for (let x = px0 - 60; x > px1 + 60; x -= 70) { const k = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 4), rng() < 0.5 ? kioskMat : new THREE.MeshStandardMaterial({ color: 0x3a8ad9, roughness: 0.7 })); k.position.set(x, deckY + 1.85, pz + (rng() < 0.5 ? -5 : 5)); k.castShadow = true; k.layers.enable(2); pier.add(k); const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 5), new THREE.MeshStandardMaterial({ color: 0xf4f1de })); roof.position.set(x, deckY + 3.6, k.position.z); roof.layers.enable(2); pier.add(roof); }
  // bollards so the car cannot drive onto the deck
  for (const dz of [-6, -3, 0, 3, 6]) collide.addCircle(px0 + 1, pz + dz, 0.3, 'bollard');
  for (const dz of [-6, -3, 0, 3, 6]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 8), parapetMat); b.position.set(px0 + 1, 2.6, pz + dz); b.layers.enable(2); pier.add(b); }

  // Ferris wheel
  const wheel = new THREE.Group(); const wx = -340, wy = deckY + 15, wz = pz; wheel.position.set(wx, wy, wz); pier.add(wheel);
  const R = 12;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 8, 48), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0.4 })); wheel.add(rim);
  const rim2 = rim.clone(); rim.position.z = -1.2; rim2.position.z = 1.2; wheel.add(rim2);
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0xe0e4e8, roughness: 0.5, metalness: 0.5 });
  const spokeGeos = [];
  const NS = 16;
  for (let i = 0; i < NS; i++) { const a = (i / NS) * Math.PI * 2; for (const dz of [-1.2, 1.2]) spokeGeos.push(new THREE.BoxGeometry(0.1, R, 0.1).translate(0, R / 2, dz).applyMatrix4(new THREE.Matrix4().makeRotationZ(a))); }
  wheel.add(new THREE.Mesh(mergeGeometries(spokeGeos), spokeMat));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.2, 16).rotateX(Math.PI / 2), spokeMat); wheel.add(hub);
  const gondolas = [];
  const gondMats = [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d, 0xffd166].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
  for (let i = 0; i < NS; i++) { const a = (i / NS) * Math.PI * 2; const g = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 2.4), gondMats[i % gondMats.length]); const piv = new THREE.Group(); piv.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); g.position.y = -1.1; piv.add(g); wheel.add(piv); gondolas.push({ piv, a }); }
  // bulbs along the spokes (instanced, emissive at night with a chase)
  const NB = NS * 6;
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd070, emissiveIntensity: 0, roughness: 0.4 });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 5), bulbMat, NB);
  const bm = new THREE.Matrix4();
  for (let i = 0; i < NS; i++) for (let k = 0; k < 6; k++) { const a = (i / NS) * Math.PI * 2, r = 2.5 + k * 1.6; bm.makeTranslation(Math.cos(a) * r, Math.sin(a) * r, 1.45); bulbs.setMatrixAt(i * 6 + k, bm); }
  bulbs.instanceMatrix.needsUpdate = true; wheel.add(bulbs);
  // support legs
  for (const sgn of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, Math.hypot(15, 8), 0.5), spokeMat); leg.position.set(wx + sgn * 4, deckY + 7.5, wz + 2.2); leg.rotation.z = sgn * Math.atan2(8, 15) * -1; leg.layers.enable(2); pier.add(leg); const leg2 = leg.clone(); leg2.position.z = wz - 2.2; pier.add(leg2); }
  for (let i = 0; i < 4; i++) lighting.addSpot(wx + (i - 1.5) * 9, wy, wz + 3, 0xffd070, 60, 26, 'pier');
  pier.traverse((o) => { if (o.isMesh) o.layers.enable(2); });

  // ------------------------------------------------------------------ lifeguard towers + boardwalk
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x4aa3d9, roughness: 0.7 });
  for (const z of [-180, -60, 60, 200]) { const x = -88; const y = groundY(x, z); const t = new THREE.Group(); t.position.set(x, y, z); group.add(t); const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), towerMat); cab.position.y = 3.6; cab.castShadow = true; t.add(cab); const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 3.6), new THREE.MeshStandardMaterial({ color: 0xf4f1de })); roof.position.y = 4.9; t.add(roof); for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), woodLike()); leg.position.set(dx, 1.3, dz); t.add(leg); } t.traverse((o) => { if (o.isMesh) o.layers.enable(2); }); collide.addBox(x, z, 1.6, 1.6, 0, 'tower'); }
  function woodLike() { return new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }); }
  const boardwalk = new THREE.Mesh(new THREE.PlaneGeometry(4, 520).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: deckTex.clone(), roughness: 0.9 }));
  boardwalk.material.map.repeat.set(1, 60); boardwalk.material.map.needsUpdate = true; boardwalk.position.set(-64, 2.06, 0); boardwalk.receiveShadow = true; boardwalk.layers.enable(2); group.add(boardwalk);

  // ------------------------------------------------------------------ night state
  let chase = 0;
  function update(dt, night, streetOn) {
    wheel.rotation.z += dt * 0.12;
    for (const gd of gondolas) gd.piv.rotation.z = -wheel.rotation.z; // gondolas stay upright
    const lit = streetOn;
    for (const st of styles) st.mat.emissiveIntensity = lit ? 0.9 : 0;
    pierLampMat.emissiveIntensity = lit ? 2.5 : 0;
    chase += dt * 3;
    bulbMat.emissiveIntensity = lit ? 2.0 + Math.sin(chase) * 1.2 : 0;
  }
  return { group, pier, wheel, update, styles };
}

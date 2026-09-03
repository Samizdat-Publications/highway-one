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
  // photo facades (roof-tile strip at the top and the sidewalk at the bottom are cropped away)
  for (const [i, name] of [[0, 'facade_stucco'], [1, 'facade_deco'], [4, 'facade_brick']]) {
    const t = T.photoTex(name, { repeat: [1, 0.88], offset: [0, 0.06] });
    if (t) { styles[i].mat.map = t; styles[i].mat.needsUpdate = true; styles[i].photo = true; }
  }
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1, map: T.photoTex('roof', { repeat: [1, 1] }) || null });
  if (!roofMat.map) roofMat.color.setHex(0x4a4744);
  const parapetMat = new THREE.MeshStandardMaterial({ color: 0xb9ae9a, roughness: 0.9 });
  const buckets = new Map();
  const push = (mat, geo) => { if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };

  // building: 4 wall planes with UV repeats matching 4 m columns / 3.4 m floors, roof + parapet
  function building(x0, z0, w, d, floors, style) {
    const y = groundY(x0 + w / 2, z0 + d / 2) + 0.02;
    const fh = 3.4, h = floors * fh;
    const mkWall = (cx, cz, len, yaw) => {
      const g = new THREE.PlaneGeometry(len, h);
      const photo = styles[style].photo; const perTile = photo ? 3 : 4, tileW = photo ? 20 : 16;
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const v = g.attributes.position.getY(i) / h + 0.5; uv.setXY(i, uv.getX(i) * (len / tileW), 1 - floors / perTile + v * (floors / perTile)); }
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(cx, y + h / 2, cz);
      return g;
    };
    push(styles[style].mat, mkWall(x0 + w / 2, z0 + d, w, 0));               // south face (+z) faces +z
    push(styles[style].mat, mkWall(x0 + w / 2, z0, w, Math.PI));             // north face
    push(styles[style].mat, mkWall(x0 + w, z0 + d / 2, d, Math.PI / 2));     // east face
    push(styles[style].mat, mkWall(x0, z0 + d / 2, d, -Math.PI / 2));        // west face
    { const rg = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); const ruv = rg.attributes.uv; for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * w / 10, ruv.getY(i) * d / 10); push(roofMat, rg.translate(x0 + w / 2, y + h, z0 + d / 2)); }
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

  // ------------------------------------------------------------------ lifeguard towers + boardwalk
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x4aa3d9, roughness: 0.7 });
  for (const z of [-180, -60, 60, 200]) { const x = -88; const y = groundY(x, z); const t = new THREE.Group(); t.position.set(x, y, z); group.add(t); const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), towerMat); cab.position.y = 3.6; cab.castShadow = true; t.add(cab); const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 3.6), new THREE.MeshStandardMaterial({ color: 0xf4f1de })); roof.position.y = 4.9; t.add(roof); for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), woodLike()); leg.position.set(dx, 1.3, dz); t.add(leg); } t.traverse((o) => { if (o.isMesh) o.layers.enable(2); }); collide.addBox(x, z, 1.6, 1.6, 0, 'tower'); }
  function woodLike() { return new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }); }
  const boardwalk = new THREE.Mesh(new THREE.PlaneGeometry(4, 520).rotateX(-Math.PI / 2), M.rep('pierDeck', 1, 60)); boardwalk.position.set(-64, 2.06, 0); boardwalk.receiveShadow = true; boardwalk.layers.enable(2); group.add(boardwalk);

  // ------------------------------------------------------------------ night state
  function update(dt, night, streetOn) {
    const lit = streetOn;
    for (const st of styles) st.mat.emissiveIntensity = lit ? 0.9 : 0;
  }
  return { group, update, styles };
}

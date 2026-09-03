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
  const SHOPS = ['PELICAN CAFE', 'SURF SHOP', 'TACO STAND', 'PHARMACY', 'BOOKS & RECORDS', 'LIQUOR', 'DINER', 'BOARD RENTALS', 'GELATO', 'SUNSET GRILL', 'HARDWARE', 'YOGA', 'BIKE HIRE', 'TATTOO', 'COFFEE', 'POKE BOWL', 'DENTIST', 'GALLERY', 'THRIFT', 'FISH MARKET'];
  const awnCols = ['#c1121f', '#1f6f8b', '#2a9d8f', '#e9c46a', '#264653', '#e76f51'];
  const signMats = new Map();
  function signMat(text, bg) {
    const key = text + bg; if (signMats.has(key)) return signMats.get(key);
    const tex = T.canvasTex(512, 96, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#fff6e0'; g.font = '800 44px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); }, { wrap: false });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
    signMats.set(key, m); return m;
  }
  const awningMats = awnCols.map((c) => new THREE.MeshStandardMaterial({ map: T.canvasTex(128, 64, (g, w, h) => { for (let i = 0; i < w; i += 16) { g.fillStyle = i % 32 ? '#f4f1de' : c; g.fillRect(i, 0, 16, h); } }, { repeat: [3, 1] }), roughness: 0.85, side: THREE.DoubleSide }));
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
    if (rng() < 0.3) push(parapetMat, new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10).translate(x0 + w * 0.7, y + h + 1.3, z0 + d * 0.3));
    // storefront: sign board + striped awning on the face toward the nearest street
    const face = streetFace(x0, z0, w, d);
    if (face) {
      const shop = SHOPS[Math.floor(rng() * SHOPS.length)], bg = awnCols[Math.floor(rng() * awnCols.length)];
      const len = Math.min(face.len * 0.7, 12), yaw = face.yaw;
      const sign = new THREE.PlaneGeometry(len, len * 96 / 512 * 0.9).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(face.cx + face.nx * 0.06, y + 3.55, face.cz + face.nz * 0.06);
      push(signMat(shop, bg), sign);
      const awn = new THREE.BoxGeometry(len + 1, 0.12, 1.4).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(face.cx + face.nx * 0.8, y + 2.9, face.cz + face.nz * 0.8);
      push(awningMats[Math.floor(rng() * awningMats.length)], awn);
    }
    collide.addBox(x0 + w / 2, z0 + d / 2, w / 2, d / 2, 0, 'building');
  }

  // which face of a building looks at the closest street: returns { cx, cz, nx, nz, yaw, len }
  function streetFace(x0, z0, w, d) {
    const faces = [
      { cx: x0 + w / 2, cz: z0 + d, nx: 0, nz: 1, yaw: 0, len: w }, { cx: x0 + w / 2, cz: z0, nx: 0, nz: -1, yaw: Math.PI, len: w },
      { cx: x0 + w, cz: z0 + d / 2, nx: 1, nz: 0, yaw: Math.PI / 2, len: d }, { cx: x0, cz: z0 + d / 2, nx: -1, nz: 0, yaw: -Math.PI / 2, len: d },
    ];
    let best = null, bd = 1e9;
    for (const f of faces) { const n = roads.nearest(f.cx + f.nx * 6, f.cz + f.nz * 6, 30); const dd = n ? n.dist : 1e9; if (dd < bd) { bd = dd; best = f; } }
    return bd < 16 ? best : null;
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
      if (rng() < 0.12) { // paved parking lot with stalls
        const lw0 = bw / nx, ld0 = bd / nz;
        const px0 = bx0 + a * lw0 + 1, pz0 = bz0 + b * ld0 + 1, pw = lw0 - 2, pd = ld0 - 2;
        const yy = groundY(px0 + pw / 2, pz0 + pd / 2) + 0.05;
        const lot = new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2); const luv = lot.attributes.uv; for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * pw / 8, luv.getY(i) * pd / 8);
        push(M.asphalt, lot.translate(px0 + pw / 2, yy, pz0 + pd / 2));
        for (let sx = px0 + 3; sx < px0 + pw - 3; sx += 2.7) push(M.paintWhite, new THREE.PlaneGeometry(0.12, 5).rotateX(-Math.PI / 2).translate(sx, yy + 0.02, pz0 + 4));
        continue;
      }
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
    for (const m of signMats.values()) m.emissiveIntensity = lit ? 1.4 : 0;
  }
  return { group, update, styles };
}

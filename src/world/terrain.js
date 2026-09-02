// Heightfield terrain: beach shelf, town plain, coastal cliffs, hills, canyon, headlands over the tunnels.
// Flattened to road height inside a corridor around every road (except tunnel/bridge spans). Chunked meshes
// with vertex colours (sand / grass / scrub / rock) and a tiling detail texture.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../units.js';
import { PCH_NORTH, TOWN } from './layout.js';

const CHUNK = 120, STEP = 4;

// cheap value noise
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, z, oct = 4) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.1; } return s; }

export function createTerrain(roads, M, T) {
  // coast profile: PCH x and y as a function of z (north of town), continued south along Ocean Ave
  const coast = PCH_NORTH.slice().sort((a, b) => b[2] - a[2]); // z descending (south → north)
  function coastAt(z) {
    if (z >= coast[0][2]) return { x: TOWN.oceanAveX, y: TOWN.y };
    for (let i = 0; i < coast.length - 1; i++) {
      const a = coast[i], b = coast[i + 1];
      if (z <= a[2] && z >= b[2]) { const t = (a[2] - z) / (a[2] - b[2]); return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t) }; }
    }
    const e = coast[coast.length - 1]; return { x: e[0], y: e[1] };
  }

  function plainHeight(x, z) {
    let h = TOWN.y + (fbm(x * 0.01, z * 0.01) - 0.5) * 1.2;
    if (x < -60) h = lerp(h, -2.2, smoothstep(-60, -125, x)); // beach slopes into the sea
    if (x > 470) h += (x - 470) * 0.12 + fbm(x * 0.02, z * 0.02) * 12; // foothills east of town
    if (z > 300) h += smoothstep(300, 700, z) * fbm(x * 0.015, z * 0.015) * 10;
    return h;
  }
  function cliffHeight(x, z) {
    const c = coastAt(z);
    const rel = x - c.x;
    let h;
    if (rel < 0) {
      const drop = smoothstep(-8, -60, rel);
      h = lerp(c.y, -3, Math.pow(drop, 0.8));
      h += (fbm(x * 0.03, z * 0.03) - 0.5) * 6 * drop * (1 - drop);
    } else {
      h = c.y + clamp(rel - 8, 0, 110) * 0.42 + fbm(x * 0.012, z * 0.012) * 26 * smoothstep(8, 60, rel);
    }
    return h;
  }
  function baseHeight(x, z) {
    const c = coastAt(z);
    let h;
    if (z > -200) h = plainHeight(x, z);
    else {
      // blend the town plain into the cliff/hill profile between z −200 and −480
      const k = smoothstep(-200, -480, z);
      h = lerp(plainHeight(x, z), cliffHeight(x, z), k);
      const rel = x - c.x;
      // canyon notch crossing the road around z −1310 (the bridge spans it)
      const cz = -1310, cw = 42;
      const notch = Math.exp(-((z - cz) * (z - cz)) / (cw * cw));
      h -= notch * (34 + 10 * smoothstep(-120, 40, rel)) * (1 - smoothstep(40, 140, -rel));
      // headlands over the tunnels
      for (const tz of [-955, -2145]) { const b = Math.exp(-((z - tz) * (z - tz)) / (70 * 70)); h += b * 30 * (1 - smoothstep(-20, -70, rel)); }
    }
    // sea floor keeps dropping offshore so the ocean has real depth (surf only near the shore)
    const shore = z > -260 ? -128 : coastAt(z).x - 62;
    if (x < shore) h -= (shore - x) * 0.09 + smoothstep(0, 150, shore - x) * 4;
    return h;
  }

  // corridor flattening
  function heightAt(x, z) {
    const h0 = baseHeight(x, z);
    const near = roads.nearest(x, z, 34);
    if (!near) return h0;
    const seg = near.seg, s = near.s;
    const inTunnel = seg.tunnel && s > seg.tunnel[0] + 6 && s < seg.tunnel[1] - 6;
    const inBridge = seg.bridge && s > seg.bridge[0] + 4 && s < seg.bridge[1] - 4;
    if (inTunnel || inBridge) return h0;
    const shoulderY = near.y - 0.06;
    const w = seg.type === 'street' || seg.type === 'avenue' ? 6 : 8;
    const t = smoothstep(w, 32, near.dist);
    const tt = t * t * (3 - 2 * t);
    return lerp(shoulderY, h0, tt);
  }

  function surfaceType(x, z, h) {
    if (x < -60 && z > -260) return 'sand';
    if (z <= -260 && x < coastAt(z).x - 12) return h < 1 ? 'sand' : 'dirt';
    return 'grass';
  }

  // ------------------------------------------------------------------ meshes
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.generalNoise, roughness: 1, metalness: 0 });
  mat.map = T.canvasTex(256, 256, (g, w, hh) => { g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, hh); for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? '#9a9a9a' : '#d4d4d4'; g.globalAlpha = 0.25; g.fillRect(Math.random() * w, Math.random() * hh, 1 + Math.random() * 2, 1 + Math.random() * 2); } g.globalAlpha = 1; }, { srgb: true });
  mat.map.repeat.set(30, 30);
  const cSand = new THREE.Color(0xd9c497), cGrass = new THREE.Color(0x6f7d3a), cScrub = new THREE.Color(0x8d8a52), cRock = new THREE.Color(0x7a6a56), cDirt = new THREE.Color(0xa08a62);
  const tmpC = new THREE.Color();
  const bounds = { x0: -420, x1: 560, z0: -2800, z1: 940 };
  const chunks = [];
  function buildChunk(cx, cz) {
    const nx = CHUNK / STEP, nz = CHUNK / STEP;
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, nx, nz);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
      const h = heightAt(x, z);
      pos.setXYZ(i, x, h, z);
      uv.setXY(i, x / CHUNK, z / CHUNK);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
      const slope = 1 - nrm.getY(i);
      const type = surfaceType(x, z, h);
      tmpC.copy(type === 'sand' ? cSand : type === 'dirt' ? cDirt : cGrass);
      if (type === 'grass') { tmpC.lerp(cScrub, smoothstep(20, 90, h) * 0.8); tmpC.lerp(cRock, smoothstep(0.25, 0.55, slope)); }
      if (type === 'dirt') tmpC.lerp(cRock, smoothstep(0.2, 0.5, slope));
      const nse = 0.9 + 0.2 * vnoise(x * 0.15, z * 0.15);
      colors[i * 3] = tmpC.r * nse; colors[i * 3 + 1] = tmpC.g * nse; colors[i * 3 + 2] = tmpC.b * nse;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.layers.enable(2);
    mesh.userData.noMerge = true;
    group.add(mesh); chunks.push(mesh);
  }
  function build() {
    for (let cx = bounds.x0; cx < bounds.x1; cx += CHUNK) for (let cz = bounds.z0; cz < bounds.z1; cz += CHUNK) buildChunk(cx + CHUNK / 2, cz + CHUNK / 2);
    return group;
  }

  return { group, heightAt, baseHeight, surfaceType, coastAt, build, chunks, bounds };
}

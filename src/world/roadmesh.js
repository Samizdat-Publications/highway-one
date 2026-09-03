// Road geometry from the graph: ribbons with baked-marking UVs, intersection patches, stop lines,
// sidewalks + curbs, guardrails, tunnels (arch + portals), bridges (deck + piers + railings).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildRoadMesh(roads, terrain, M, T, collide) {
  const group = new THREE.Group();
  const buckets = new Map(); // material → geometries
  const push = (mat, geo) => { if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push(geo); };
  const up = new THREE.Vector3(0, 1, 0);

  const texFor = (seg) => seg.type === 'avenue' ? 'road4' : seg.type === 'street' ? 'street' : seg.type === 'lot' ? 'asphalt' : seg.type === 'side' ? 'road2' : 'road2';
  const texWidth = { road4: 15.6, street: 11, asphalt: 8, road2: 8 };

  // ribbon from lateral offsets (m) per sample in [s0, s1]; y offset; uv u across 0..1 (or world-based), v = s/12
  function ribbon(seg, offsets, s0, s1, yOff, uMode, ySampler) {
    const sm = seg.samples;
    const pts = [], uvs = [], idx = [];
    let rows = 0;
    const cols = offsets.length;
    const heightOf = (p, off, i) => (ySampler ? ySampler(p, off, i) : p.y + yOff);
    for (let i = 0; i < sm.length; i++) {
      const s = sm[i].s;
      if (s < s0 - 1e-6 || s > s1 + 1e-6) continue;
      const P = sm[i].p, N = sm[i].n;
      for (let c = 0; c < cols; c++) {
        const off = offsets[c];
        const x = P.x + N.x * off, z = P.z + N.z * off;
        pts.push(x, heightOf(P, off, i), z);
        uvs.push(uMode === 'world' ? x / 8 : c / (cols - 1), uMode === 'world' ? z / 8 : s / 12);
      }
      rows++;
    }
    if (rows < 2) return null;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // exact cut at s (adds virtual samples): simpler approach — we use sample granularity (2 m) which is fine visually

  // ------------------------------------------------------------------ segments
  for (const seg of roads.segments) {
    const hw = seg.hw;
    const tex = texFor(seg), tw = texWidth[tex];
    const trimA = seg.a.inter && seg.a.inter.radius > 0 ? seg.a.inter.radius - 0.5 : 0;
    const trimB = seg.b.inter && seg.b.inter.radius > 0 ? seg.b.inter.radius - 0.5 : 0;
    const s0 = trimA, s1 = seg.length - trimB;
    // asphalt with a slight crown; uv u maps the texture's designed width onto this ribbon
    const offs = [-hw, -hw * 0.5, 0, hw * 0.5, hw];
    const g = ribbon(seg, offs, s0, s1, 0, 'across', (p, off) => p.y + 0.03 - 0.012 * Math.abs(off));
    if (g) {
      // rescale u so the texture width matches the road width (centre the markings)
      const uv = g.attributes.uv; const scale = (2 * hw) / tw;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + (uv.getX(i) - 0.5) * scale);
      push(M[tex], g);
    }
    // sidewalks + curbs
    if (seg.sidewalk) {
      for (const side of [-1, 1]) {
        const sw = ribbon(seg, side < 0 ? [-(hw + 2.4), -hw] : [hw, hw + 2.4], s0 + 1, s1 - 1, 0.15, 'world');
        if (sw) push(M.concrete, sw);
        const curb = ribbon(seg, side < 0 ? [-(hw + 0.02), -hw] : [hw, hw + 0.02], s0 + 1, s1 - 1, 0, 'world', (p, off, i) => p.y + (Math.abs(off) > hw + 0.01 ? 0.15 : 0.0));
        if (curb) push(M.concreteDark || M.concrete, curb);
      }
    }
    // guardrail on the ocean side (left of travel direction a→b when 'L')
    if (seg.rail) {
      const side = seg.rail === 'L' ? -1 : 1;
      const off = side * (hw + 0.4);
      const beam = ribbon(seg, [off, off + side * 0.05], s0 + 2, s1 - 2, 0.55, 'world', (p, o, i) => p.y + 0.55 + (Math.abs(o) > Math.abs(off) + 0.01 ? 0.32 : 0));
      if (beam) push(M.railSteel, beam);
      // posts every 4 m + colliders every 12 m
      const postG = new THREE.BoxGeometry(0.1, 0.75, 0.1);
      const posts = [];
      for (let s = s0 + 2; s < s1 - 2; s += 4) {
        const sm = roads.sampleAt(seg, s);
        if (seg.tunnel && s > seg.tunnel[0] && s < seg.tunnel[1]) continue;
        if (seg.bridge && s > seg.bridge[0] && s < seg.bridge[1]) continue;
        const pg = postG.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(sm.t.x, sm.t.z))).translate(sm.p.x + sm.n.x * off, sm.p.y + 0.37, sm.p.z + sm.n.z * off);
        posts.push(pg);
      }
      if (posts.length) push(M.railSteel, mergeGeometries(posts));
      for (let s = s0 + 2; s < s1 - 2; s += 12) { const sm = roads.sampleAt(seg, Math.min(s + 6, s1 - 2)); collide.addBox(sm.p.x + sm.n.x * off, sm.p.z + sm.n.z * off, 0.15, 6.2, Math.atan2(-sm.t.x, -sm.t.z), 'guardrail'); }
    }
    // tunnels
    if (seg.tunnel) buildTunnel(seg, seg.tunnel[0], seg.tunnel[1]);
    if (seg.bridge) buildBridge(seg, seg.bridge[0], seg.bridge[1]);
  }

  function buildTunnel(seg, t0, t1) {
    const R = 6.2, hw = seg.hw;
    // arch: offsets along a half circle (from left wall to right wall), heights from the arc
    const N = 14, offs = [], ys = [];
    for (let i = 0; i <= N; i++) { const a = Math.PI - (i / N) * Math.PI; offs.push(Math.cos(a) * R); ys.push(Math.sin(a) * R + 0.4); }
    const arch = ribbon(seg, offs, t0, t1, 0, 'world', (p, off, i) => { const k = offs.indexOf(off); return p.y + Math.max(0.1, ys[k]); });
    if (arch) { const m = M.tunnelWall; push(m, arch); }
    // walls/kerb colliders along both sides
    for (let s = t0; s < t1; s += 10) {
      const sm = roads.sampleAt(seg, Math.min(s + 5, t1));
      for (const side of [-1, 1]) collide.addBox(sm.p.x + sm.n.x * side * (hw + 0.6), sm.p.z + sm.n.z * side * (hw + 0.6), 0.5, 5.2, Math.atan2(-sm.t.x, -sm.t.z), 'tunnel');
    }
    // portals: a wall with an arch hole at each end
    for (const s of [t0, t1]) {
      const sm = roads.sampleAt(seg, s);
      const shape = new THREE.Shape(); shape.moveTo(-14, -1); shape.lineTo(14, -1); shape.lineTo(14, 12); shape.lineTo(-14, 12); shape.closePath();
      const hole = new THREE.Path(); hole.absarc(0, 0.4, R + 0.3, 0, Math.PI, false); hole.lineTo(-(R + 0.3), -1); hole.lineTo(R + 0.3, -1); hole.closePath();
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false });
      const yaw = Math.atan2(sm.t.x, sm.t.z);
      geo.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(sm.p.x, sm.p.y, sm.p.z);
      push(M.concrete, geo);
      collide.addBox(sm.p.x + sm.n.x * (R + 4.0), sm.p.z + sm.n.z * (R + 4.0), 3.7, 0.6, Math.atan2(-sm.t.x, -sm.t.z), 'portal');
      collide.addBox(sm.p.x - sm.n.x * (R + 4.0), sm.p.z - sm.n.z * (R + 4.0), 3.7, 0.6, Math.atan2(-sm.t.x, -sm.t.z), 'portal');
    }
    seg.tunnelLamps = [];
    for (let s = t0 + 12; s < t1 - 6; s += 24) { const sm = roads.sampleAt(seg, s); seg.tunnelLamps.push(new THREE.Vector3(sm.p.x, sm.p.y + 5.2, sm.p.z)); }
  }

  function buildBridge(seg, b0, b1) {
    const hw = seg.hw;
    // deck slab under the road
    const slab = ribbon(seg, [-hw - 0.6, hw + 0.6], b0, b1, -0.9, 'world');
    if (slab) push(M.concrete, slab);
    for (const side of [-1, 1]) {
      const wall = ribbon(seg, [side * (hw + 0.6), side * (hw + 0.62)], b0, b1, 0, 'world', (p, off, i) => p.y + (Math.abs(off) > hw + 0.61 ? -0.9 : 1.05));
      if (wall) { wall.computeVertexNormals(); push(M.concrete, wall); }
      const cap = ribbon(seg, [side * (hw + 0.3), side * (hw + 0.9)], b0, b1, 1.05, 'world');
      if (cap) push(M.concrete, cap);
      for (let s = b0; s < b1; s += 10) { const sm = roads.sampleAt(seg, Math.min(s + 5, b1)); collide.addBox(sm.p.x + sm.n.x * side * (hw + 0.6), sm.p.z + sm.n.z * side * (hw + 0.6), 0.3, 5.2, Math.atan2(-sm.t.x, -sm.t.z), 'bridge'); }
    }
    // piers every 30 m down to the terrain
    const pierG = [];
    for (let s = b0 + 15; s < b1 - 5; s += 30) {
      const sm = roads.sampleAt(seg, s);
      const ground = terrain.baseHeight(sm.p.x, sm.p.z);
      const h = Math.max(2, sm.p.y - 1.2 - ground);
      const pg = new THREE.BoxGeometry(hw * 1.2, h, 2.2).translate(sm.p.x, ground + h / 2, sm.p.z);
      pg.applyMatrix4(new THREE.Matrix4().makeTranslation(-sm.p.x, 0, -sm.p.z)).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(sm.t.x, sm.t.z))).applyMatrix4(new THREE.Matrix4().makeTranslation(sm.p.x, 0, sm.p.z));
      pierG.push(pg);
    }
    if (pierG.length) push(M.concrete, mergeGeometries(pierG));
  }

  // ------------------------------------------------------------------ intersections
  for (const inter of roads.intersections) {
    if (inter.radius <= 0) continue;
    const c = inter.node.p;
    const pts = [c.x, c.y + 0.03, c.z], uvs = [c.x / 8, c.z / 8], idx = [];
    const corners = [];
    for (const ap of inter.approaches) {
      const seg = ap.seg, hw = seg.hw;
      const s = ap.dir === 1 ? seg.length - (inter.radius - 0.5) : inter.radius - 0.5;
      const sm = roads.sampleAt(seg, s);
      // corners ordered by angle around the centre
      for (const side of [-1, 1]) corners.push(new THREE.Vector3(sm.p.x + sm.n.x * side * hw, c.y + 0.03, sm.p.z + sm.n.z * side * hw));
      // stop line decal for this approach
      const w = hw * 2, lineS = s + ap.dir * -0.6;
      const smL = roads.sampleAt(seg, lineS);
      const yaw = Math.atan2(smL.t.x, smL.t.z);
      const lineG = new THREE.PlaneGeometry(w - 0.4, 0.45).rotateX(-Math.PI / 2).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(smL.p.x, smL.p.y + 0.055, smL.p.z);
      push(M.paintWhite, lineG);
      // approach quad from the ribbon end to the patch is covered by the fan below
    }
    corners.sort((p, q) => Math.atan2(p.z - c.z, p.x - c.x) - Math.atan2(q.z - c.z, q.x - c.x));
    for (const p of corners) { pts.push(p.x, p.y, p.z); uvs.push(p.x / 8, p.z / 8); }
    const n = corners.length;
    for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    push(M.asphalt, g);
  }

  // ------------------------------------------------------------------ merge
  for (const [mat, geos] of buckets) {
    const valid = geos.filter((g) => g && g.attributes.position && g.attributes.position.count > 0);
    if (!valid.length) continue;
    const flat = valid.map((g) => { if (!g.attributes.normal) g.computeVertexNormals(); return g.index ? g.toNonIndexed() : g; });
    const merged = mergeGeometries(flat, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true; mesh.castShadow = mat === M.concrete || mat === M.tunnelWall;
    mesh.layers.enable(2);
    if (mat === M.paintWhite) { mesh.renderOrder = 2; }
    group.add(mesh);
  }
  return { group };
}

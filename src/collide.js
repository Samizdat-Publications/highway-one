// 2-D oriented-box collision for the car against static props (guardrails, walls, buildings, poles)
// and dynamic traffic. Spatial hash + SAT with minimum-translation push-out and a simple impulse.
import { clamp, sign } from './units.js';

const CELL = 25;
export function createCollide() {
  const boxes = [];
  const hash = new Map();
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  function addBox(cx, cz, hw, hd, yaw, tag) { // hw along the box's local x (width/2), hd along local z (depth/2)
    const b = { cx, cz, hw, hd, yaw, tag, c: Math.cos(yaw), s: Math.sin(yaw) };
    boxes.push(b);
    const r = Math.hypot(hw, hd);
    const x0 = Math.floor((cx - r) / CELL), x1 = Math.floor((cx + r) / CELL), z0 = Math.floor((cz - r) / CELL), z1 = Math.floor((cz + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = `${i},${j}`; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(b); }
    return b;
  }
  function addCircle(cx, cz, r, tag) { return addBox(cx, cz, r, r, 0, tag); }

  // OBB corners in world (x,z): local axes ax=(c, -s)?? we define yaw as rotation about y: local x → (cos, 0, -sin) ... keep consistent with car.right()
  function corners(b, out) {
    // local x axis (width) = right vector for yaw: (cos yaw, -sin yaw); local z axis (depth) = forward: (-sin yaw, -cos yaw)
    const rx = b.c, rz = -b.s, fx = -b.s, fz = -b.c;
    out[0] = b.cx + rx * b.hw + fx * b.hd; out[1] = b.cz + rz * b.hw + fz * b.hd;
    out[2] = b.cx - rx * b.hw + fx * b.hd; out[3] = b.cz - rz * b.hw + fz * b.hd;
    out[4] = b.cx - rx * b.hw - fx * b.hd; out[5] = b.cz - rz * b.hw - fz * b.hd;
    out[6] = b.cx + rx * b.hw - fx * b.hd; out[7] = b.cz + rz * b.hw - fz * b.hd;
    return out;
  }
  const cA = new Float64Array(8), cB = new Float64Array(8);
  function project(c, ax, az) { let mn = 1e18, mx = -1e18; for (let i = 0; i < 8; i += 2) { const p = c[i] * ax + c[i + 1] * az; if (p < mn) mn = p; if (p > mx) mx = p; } return [mn, mx]; }
  // SAT between two boxes; returns { nx, nz, depth } pushing A out of B, or null
  function sat(A, B) {
    corners(A, cA); corners(B, cB);
    const axes = [[A.c, -A.s], [-A.s, -A.c], [B.c, -B.s], [-B.s, -B.c]];
    let best = null, bestDepth = 1e18;
    for (const [ax, az] of axes) {
      const [a0, a1] = project(cA, ax, az), [b0, b1] = project(cB, ax, az);
      const overlap = Math.min(a1, b1) - Math.max(a0, b0);
      if (overlap <= 0) return null;
      if (overlap < bestDepth) { bestDepth = overlap; const dirSign = (A.cx - B.cx) * ax + (A.cz - B.cz) * az >= 0 ? 1 : -1; best = [ax * dirSign, az * dirSign]; }
    }
    return { nx: best[0], nz: best[1], depth: bestDepth };
  }

  const carBox = { cx: 0, cz: 0, hw: 0.91, hd: 2.27, yaw: 0, c: 1, s: 0 };
  const events = [];
  // resolve the car against static boxes (and optional dynamic list). Mutates car.S.
  function resolveCar(car, dynamic) {
    const S = car.S;
    carBox.cx = S.x; carBox.cz = S.z; carBox.yaw = S.yaw; carBox.c = Math.cos(S.yaw); carBox.s = Math.sin(S.yaw);
    carBox.hw = car.C.width / 2; carBox.hd = car.C.length / 2;
    const cand = [];
    const cx = Math.floor(S.x / CELL), cz = Math.floor(S.z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = hash.get(`${cx + i},${cz + j}`); if (l) for (const b of l) if (!cand.includes(b)) cand.push(b); }
    if (dynamic) for (const b of dynamic) cand.push(b);
    let hit = null;
    for (const b of cand) {
      const r = sat(carBox, b);
      if (!r) continue;
      // push out
      S.x += r.nx * r.depth; S.z += r.nz * r.depth; carBox.cx = S.x; carBox.cz = S.z;
      // impulse: remove approaching normal velocity, damp tangential
      const vn = S.vx * r.nx + S.vz * r.nz;
      const bvx = b.vx || 0, bvz = b.vz || 0, bvn = bvx * r.nx + bvz * r.nz;
      const rel = vn - bvn;
      if (rel < 0) {
        const e = 0.25;
        S.vx -= (1 + e) * rel * r.nx; S.vz -= (1 + e) * rel * r.nz;
        // tangential friction
        const tx = -r.nz, tz = r.nx; const vt = S.vx * tx + S.vz * tz;
        S.vx -= vt * 0.25 * tx; S.vz -= vt * 0.25 * tz;
        // yaw kick from the lever arm of the contact (approximate: contact at the nearest corner)
        const lever = (r.nx * (-Math.sin(S.yaw)) + r.nz * (-Math.cos(S.yaw))); // alignment of normal with forward
        S.yawRate += -sign(lever) * Math.abs(rel) * 0.15 * (Math.random() < 0.5 ? -1 : 1) * (1 - Math.abs(lever));
        const speed = Math.abs(rel);
        if (!hit || speed > hit.speed) hit = { speed, tag: b.tag, nx: r.nx, nz: r.nz, box: b };
      }
    }
    if (hit) { S.lastCollision = hit; events.push(hit); }
    return hit;
  }
  function drain() { const e = events.slice(); events.length = 0; return e; }
  return { boxes, addBox, addCircle, resolveCar, drain, sat, corners };
}

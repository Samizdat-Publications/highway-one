// Ambient traffic: a pool of vehicles spawned on lanes in a ring around the player, driven by driver.js,
// rendered as instanced meshes (bodies with per-instance colour, cabins, wheels, lamps), and exposed as
// dynamic collision boxes for the player car.
import * as THREE from 'three';
import { clamp, MPH_TO_MPS } from '../units.js';
import { createRng } from '../rng.js';

export function createTraffic(scene, roads, driver, car, opts = {}) {
  const N = opts.count || 36;
  const rng = createRng(0x7a11);
  const agents = [];
  const colors = [0xd8dce0, 0x1c1f24, 0x8a1c1c, 0x2c4a8a, 0xe8e6df, 0x3f5f3a, 0x6f6f72, 0xb8742c, 0xc9a227, 0x5a2d82];

  // ---- meshes
  const bodyG = new THREE.BoxGeometry(1.78, 0.6, 4.4); bodyG.translate(0, 0.62, 0);
  const hoodG = new THREE.BoxGeometry(1.7, 0.28, 1.4); hoodG.translate(0, 0.95, -1.35);
  const cabinG = new THREE.BoxGeometry(1.62, 0.55, 2.3); cabinG.translate(0, 1.2, 0.25);
  const wheelG = new THREE.CylinderGeometry(0.31, 0.31, 0.22, 12); wheelG.rotateZ(Math.PI / 2);
  const lampG = new THREE.PlaneGeometry(0.34, 0.14);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5, envMapIntensity: 1.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.12, metalness: 0.3 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.9 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0a0a, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xd8dde3, emissive: 0xfff2dc, emissiveIntensity: 0, roughness: 0.2 });
  const bodies = new THREE.InstancedMesh(bodyG, bodyMat, N), hoods = new THREE.InstancedMesh(hoodG, bodyMat, N), cabins = new THREE.InstancedMesh(cabinG, glassMat, N);
  const wheels = new THREE.InstancedMesh(wheelG, tyreMat, N * 4), tails = new THREE.InstancedMesh(lampG, tailMat, N * 2), heads = new THREE.InstancedMesh(lampG, headMat, N * 2);
  for (const im of [bodies, hoods, cabins, wheels, tails, heads]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = im !== tails && im !== heads; im.layers.enable(2); scene.add(im); }
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) { bodies.setColorAt(i, col.setHex(colors[i % colors.length])); hoods.setColorAt(i, col); }
  bodies.instanceColor.needsUpdate = true; hoods.instanceColor.needsUpdate = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), d = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---- pool
  for (let i = 0; i < N; i++) agents.push({ id: i, active: false, seg: null, k: 1, t: 0, conn: null, ct: 0, next: null, v: 0, a: 0, speedFactor: 0.9 + rng() * 0.2, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), yaw: 0, signal: null, stopState: 'none', stopT: 0, dStop: Infinity, len: 4.4, box: { cx: 0, cz: 0, hw: 0.9, hd: 2.2, yaw: 0, c: 1, s: 0, vx: 0, vz: 0, tag: 'traffic' }, stuckT: 0, lastT: 0, blinkT: 0 });
  const lanes = []; for (const [key, lane] of roads.laneGraph) lanes.push(lane);
  const playerPos = new THREE.Vector3();

  function spawn(agent) {
    for (let tries = 0; tries < 30; tries++) {
      const lane = lanes[Math.floor(rng() * lanes.length)];
      if (lane.seg.type === 'lot') continue;
      const t = rng() * Math.max(1, lane.seg.length - 20) + 5;
      const s = driver.sFromT(lane.seg, lane.k, t);
      roads.lanePoint(lane.seg, lane.k, s, p);
      const dist = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (dist < 90 || dist > 320) continue;
      // keep spacing from others
      let ok = true; for (const o of agents) if (o.active && o.pos.distanceTo(p) < 14) { ok = false; break; }
      if (!ok) continue;
      Object.assign(agent, { active: true, seg: lane.seg, k: lane.k, t, conn: null, ct: 0, next: null, v: lane.seg.limitMph * MPH_TO_MPS * 0.7, signal: null, stopState: 'none', stuckT: 0, dead: false });
      driver.pose(agent, agent.pos, agent.dir); agent.yaw = Math.atan2(-agent.dir.x, -agent.dir.z);
      return true;
    }
    return false;
  }
  function despawn(agent) { agent.active = false; if (agent.conn && agent.conn.inter.occupants) agent.conn.inter.occupants.delete(agent); agent.conn = null; }

  // ---- per-step (60 Hz)
  const laneLists = new Map(); // laneKey → [{agent, t}] sorted by t; connectors keyed by object
  const connLists = new Map();
  let playerLane = null, playerT = 0, playerV = 0;
  function rebuildLists(here) {
    laneLists.clear(); connLists.clear();
    for (const ag of agents) { if (!ag.active) continue; if (ag.conn) { if (!connLists.has(ag.conn)) connLists.set(ag.conn, []); connLists.get(ag.conn).push(ag); } else { const key = roads.laneKey(ag.seg, ag.k); if (!laneLists.has(key)) laneLists.set(key, []); laneLists.get(key).push(ag); } }
    for (const list of laneLists.values()) list.sort((a, b) => a.t - b.t);
    // approach queues for yield decisions
    for (const it of roads.intersections) { for (const ap of it.approaches) ap.queue = null; it.playerInside = false; }
    for (const ag of agents) { if (!ag.active || ag.conn) continue; const apx = driver.approachFor(ag.seg, ag.k); if (!apx) continue; ag.dStop = apx.tStop - ag.t; if (ag.dStop < 40) { (apx.ap.queue || (apx.ap.queue = [])).push(ag); } }
    // player as a virtual vehicle
    playerLane = null;
    if (here && here.seg && here.laneIndex) { playerLane = roads.laneKey(here.seg, here.laneIndex); playerT = driver.tFromS(here.seg, here.laneIndex, here.s); playerV = Math.abs(car.S.vFwd); }
    if (here && here.inter) here.inter.playerInside = true;
  }
  // gap to the nearest vehicle ahead on the same lane (or the next connector / lane), null if none within 80 m
  function leaderGap(ag) {
    let bestGap = null, bestV = 0;
    const consider = (gap, v) => { if (gap >= -1 && (bestGap == null || gap < bestGap)) { bestGap = gap; bestV = v; } };
    if (ag.conn) {
      const list = connLists.get(ag.conn) || [];
      for (const o of list) if (o !== ag && o.ct > ag.ct) consider(o.ct - ag.ct - o.len, o.v);
      // vehicles at the start of the target lane
      const tl = laneLists.get(roads.laneKey(ag.conn.to.seg, ag.conn.to.k)) || [];
      const t0 = driver.laneStartT(ag.conn);
      for (const o of tl) if (o.t >= t0 - 1 && o.t < t0 + 30) consider((ag.conn.length - ag.ct) + (o.t - t0) - o.len, o.v);
      if (playerLane === roads.laneKey(ag.conn.to.seg, ag.conn.to.k) && playerT >= t0 - 1 && playerT < t0 + 30) consider((ag.conn.length - ag.ct) + (playerT - t0) - 4.5, playerV);
      // player inside the box ahead
      if (ag.conn.inter.playerInside) { const dp = Math.hypot(car.S.x - ag.pos.x, car.S.z - ag.pos.z); const ahead = (car.S.x - ag.pos.x) * ag.dir.x + (car.S.z - ag.pos.z) * ag.dir.z; if (ahead > 0 && dp < 16) consider(dp - 4.5, playerV); }
    } else {
      const key = roads.laneKey(ag.seg, ag.k);
      const list = laneLists.get(key) || [];
      for (const o of list) if (o !== ag && o.t > ag.t) consider(o.t - ag.t - o.len, o.v);
      if (playerLane === key && playerT > ag.t) consider(playerT - ag.t - 4.5, playerV);
      // look through the chosen connector into the next lane
      if (ag.next && bestGap == null) {
        const apx = driver.approachFor(ag.seg, ag.k); const toEnd = apx ? apx.tStop - ag.t : Infinity;
        if (toEnd < 60) {
          const cl = connLists.get(ag.next) || []; for (const o of cl) consider(toEnd + o.ct - o.len, o.v);
          const tl = laneLists.get(roads.laneKey(ag.next.to.seg, ag.next.to.k)) || []; const t0 = driver.laneStartT(ag.next);
          for (const o of tl) if (o.t >= t0 - 1 && o.t < t0 + 25) consider(toEnd + ag.next.length + (o.t - t0) - o.len, o.v);
        }
      }
    }
    // generic proximity check against the player (any lane, e.g. player crossing ahead)
    const dx = car.S.x - ag.pos.x, dz = car.S.z - ag.pos.z; const ahead = dx * ag.dir.x + dz * ag.dir.z; const side = Math.abs(-dx * ag.dir.z + dz * ag.dir.x);
    if (ahead > 0 && ahead < 22 && side < 2.6) consider(ahead - 4.5, playerV);
    return { gap: bestGap, v: bestV };
  }

  const AI_DT = 1 / 60;
  function update(dt, here, night) {
    playerPos.set(car.S.x, 0, car.S.z);
    rebuildLists(here);
    let active = 0;
    for (const ag of agents) {
      if (!ag.active) continue;
      const dist = Math.hypot(ag.pos.x - car.S.x, ag.pos.z - car.S.z);
      if (dist > 340 || ag.dead) { despawn(ag); continue; }
      active++;
      // decisions
      const ctl = driver.controlAt(ag, rng);
      const dStop = driver.distToStop(ag);
      const v0 = driver.desiredSpeed(ag);
      const lead = leaderGap(ag);
      let a = driver.idm(ag.v, v0, lead.gap, ag.v - lead.v);
      ag.reason = ctl.stop ? ctl.reason : (lead.gap != null && lead.gap < 8 ? 'leader' : 'free');
      if (ctl.stop && dStop !== Infinity) { const aStop = driver.idm(ag.v, v0, Math.max(0.05, dStop + 1.5), ag.v); a = Math.min(a, aStop); }
      a = clamp(a, -6, 2.2);
      ag.a = a; ag.v = Math.max(0, ag.v + a * dt);
      driver.advance(ag, ag.v * dt, rng);
      if (ag.dead) { despawn(ag); continue; }
      driver.pose(ag, ag.pos, ag.dir); ag.yaw = Math.atan2(-ag.dir.x, -ag.dir.z);
      // stuck watchdog
      if (ag.v < 0.2) { ag.stuckT += dt; if (ag.stuckT > 25) { despawn(ag); continue; } } else ag.stuckT = 0;
      ag.blinkT += dt;
    }
    // top up
    for (const ag of agents) { if (active >= N) break; if (!ag.active && spawn(ag)) active++; }
    // render
    for (const ag of agents) {
      const i = ag.id;
      if (!ag.active) { bodies.setMatrixAt(i, hidden); hoods.setMatrixAt(i, hidden); cabins.setMatrixAt(i, hidden); for (let k = 0; k < 4; k++) wheels.setMatrixAt(i * 4 + k, hidden); for (let k = 0; k < 2; k++) { tails.setMatrixAt(i * 2 + k, hidden); heads.setMatrixAt(i * 2 + k, hidden); } continue; }
      q.setFromEuler(e.set(0, ag.yaw, 0)); m4.compose(ag.pos, q, sc);
      bodies.setMatrixAt(i, m4); hoods.setMatrixAt(i, m4); cabins.setMatrixAt(i, m4);
      const c = Math.cos(ag.yaw), s = Math.sin(ag.yaw);
      const local = (lx, ly, lz) => p.set(ag.pos.x + lx * c + lz * s, ag.pos.y + ly, ag.pos.z - lx * s + lz * c);
      // wheel spin
      const spinQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(ag.v * (ag.blinkT)) % (Math.PI * 2), ag.yaw, 0, 'YXZ'));
      [[0.82, 1.4], [-0.82, 1.4], [0.82, -1.4], [-0.82, -1.4]].forEach(([wx, wz], k) => { m4.compose(local(wx, 0.31, -wz), spinQ, sc); wheels.setMatrixAt(i * 4 + k, m4); });
      // lamps: tails at the rear (+z), heads at the front (−z); planes face outward
      const backQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ag.yaw, 0)), frontQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ag.yaw + Math.PI, 0));
      m4.compose(local(-0.6, 0.85, 2.21), backQ, sc); tails.setMatrixAt(i * 2, m4); m4.compose(local(0.6, 0.85, 2.21), backQ, sc); tails.setMatrixAt(i * 2 + 1, m4);
      m4.compose(local(-0.6, 0.8, -2.21), frontQ, sc); heads.setMatrixAt(i * 2, m4); m4.compose(local(0.6, 0.8, -2.21), frontQ, sc); heads.setMatrixAt(i * 2 + 1, m4);
      // collision box
      const b = ag.box; b.cx = ag.pos.x; b.cz = ag.pos.z; b.yaw = ag.yaw; b.c = c; b.s = s; b.vx = -ag.dir.x * ag.v * -1 * -1; b.vz = ag.dir.z * ag.v; b.vx = ag.dir.x * ag.v;
    }
    for (const im of [bodies, hoods, cabins, wheels, tails, heads]) im.instanceMatrix.needsUpdate = true;
    tailMat.emissiveIntensity = night > 0.3 ? 1.6 : 0.6; headMat.emissiveIntensity = night > 0.3 ? 4 : 0;
  }
  function nearBoxes(x, z, r) { const out = []; for (const ag of agents) if (ag.active && Math.hypot(ag.pos.x - x, ag.pos.z - z) < r) out.push(ag.box); return out; }
  function reset() { for (const ag of agents) despawn(ag); }
  return { agents, update, nearBoxes, reset, N };
}

// Lane-following driver logic shared by AI traffic and the autopilot bot: path advancement along lanes and
// intersection connectors, IDM car-following, signal / stop-sign / yield handling, turn choice.
import * as THREE from 'three';
import { clamp, MPH_TO_MPS } from '../units.js';

export const IDM = { amax: 1.6, b: 2.5, s0: 2.5, T: 1.4 };

export function createDriver(roads, signals) {
  const tmpP = new THREE.Vector3(), tmpD = new THREE.Vector3();

  // travel distance helpers: lanes with k > 0 run 0 → length; k < 0 run length → 0
  const laneLen = (seg) => seg.length;
  const sFromT = (seg, k, t) => (k > 0 ? t : seg.length - t);
  const tFromS = (seg, k, s) => (k > 0 ? s : seg.length - s);
  // stop line travel distance for an approach reached at the END of lane (seg, k)
  function approachFor(seg, k) {
    const node = k > 0 ? seg.b : seg.a;
    const inter = node.inter; if (!inter) return null;
    const ap = inter.approaches.find((a) => a.seg === seg);
    return ap ? { inter, ap, tStop: tFromS(seg, k, ap.stopS) } : null;
  }

  // ------------------------------------------------------------------ agent kinematics along the network
  // agent: { seg, k, t, conn, ct, v, ... }  (conn = connector being traversed, ct = distance along it)
  function chooseConnector(agent, rng) {
    const lane = roads.laneGraph.get(roads.laneKey(agent.seg, agent.k));
    const opts = lane ? lane.next : [];
    if (!opts.length) return null;
    const w = (c) => (c.turn === 'S' ? 0.6 : c.turn === 'R' ? 0.25 : c.turn === 'L' ? 0.15 : opts.length === 1 ? 1 : 0.02);
    let total = 0; for (const c of opts) total += w(c);
    let r = rng() * total;
    for (const c of opts) { r -= w(c); if (r <= 0) return c; }
    return opts[opts.length - 1];
  }
  function laneStartT(conn) { return conn.to.k > 0 ? conn.outApproach.stopS : conn.to.seg.length - conn.outApproach.stopS; }

  // move the agent forward by dist (m); handles lane → connector → lane transitions
  function advance(agent, dist, rng) {
    let remaining = dist;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 6) {
      if (agent.conn) {
        const c = agent.conn;
        const left = c.length - agent.ct;
        if (remaining < left) { agent.ct += remaining; remaining = 0; }
        else { remaining -= left; agent.seg = c.to.seg; agent.k = c.to.k; agent.t = laneStartT(c); if (c.inter.occupants) c.inter.occupants.delete(agent); agent.conn = null; agent.ct = 0; agent.next = null; agent.signal = null; agent.stopState = 'none'; }
      } else {
        const ap = approachFor(agent.seg, agent.k);
        const tEnd = ap ? ap.tStop : laneLen(agent.seg);
        const left = tEnd - agent.t;
        if (remaining < left) { agent.t += remaining; remaining = 0; }
        else {
          remaining -= left; agent.t = tEnd;
          if (!agent.next) agent.next = chooseConnector(agent, rng);
          if (!agent.next) { agent.dead = true; return; }
          agent.conn = agent.next; agent.ct = 0;
          if (agent.conn.inter.occupants) agent.conn.inter.occupants.add(agent); else agent.conn.inter.occupants = new Set([agent]);
          agent.stopState = 'none';
        }
      }
    }
  }
  // world position + heading of the agent (writes agent.pos / agent.yaw)
  function pose(agent, outPos, outDir) {
    if (agent.conn) {
      const pts = agent.conn.pts; let d = agent.ct;
      for (let i = 1; i < pts.length; i++) {
        const segLen = pts[i].distanceTo(pts[i - 1]);
        if (d <= segLen || i === pts.length - 1) { const f = segLen > 1e-6 ? clamp(d / segLen, 0, 1) : 0; outPos.lerpVectors(pts[i - 1], pts[i], f); outDir.subVectors(pts[i], pts[i - 1]).normalize(); if (outDir.lengthSq() < 0.5) outDir.set(0, 0, -1); return; }
        d -= segLen;
      }
      outPos.copy(pts[pts.length - 1]); outDir.set(0, 0, -1);
    } else {
      const s = sFromT(agent.seg, agent.k, agent.t);
      roads.lanePoint(agent.seg, agent.k, s, outPos);
      roads.laneDir(agent.seg, agent.k, s, outDir);
    }
  }
  // a point `ahead` metres further along the agent's path (for steering look-ahead)
  const ghost = {};
  function lookAhead(agent, ahead, outPos, outDir) {
    Object.assign(ghost, { seg: agent.seg, k: agent.k, t: agent.t, conn: agent.conn, ct: agent.ct, next: agent.next, dead: false, stopState: 'none' });
    // do not mutate intersections for the ghost
    const saveNext = agent.next;
    advanceGhost(ghost, ahead);
    agent.next = saveNext;
    pose(ghost, outPos, outDir);
  }
  function advanceGhost(g, dist) {
    let remaining = dist, guard = 0;
    while (remaining > 1e-6 && guard++ < 6) {
      if (g.conn) { const left = g.conn.length - g.ct; if (remaining < left) { g.ct += remaining; return; } remaining -= left; g.seg = g.conn.to.seg; g.k = g.conn.to.k; g.t = laneStartT(g.conn); g.conn = null; g.ct = 0; g.next = null; }
      else { const ap = approachFor(g.seg, g.k); const tEnd = ap ? ap.tStop : g.seg.length; const left = tEnd - g.t; if (remaining < left) { g.t += remaining; return; } remaining -= left; g.t = tEnd; if (!g.next) return; g.conn = g.next; g.ct = 0; }
    }
  }

  // ------------------------------------------------------------------ decisions
  // distance from the agent to its next stop line (Infinity if none / on a connector)
  function distToStop(agent) {
    if (agent.conn) return Infinity;
    const ap = approachFor(agent.seg, agent.k);
    return ap ? ap.tStop - agent.t : Infinity;
  }
  // should the agent stop at the upcoming stop line? returns { stop: bool, reason }
  function controlAt(agent, rng) {
    const ap = approachFor(agent.seg, agent.k);
    if (!ap) return { stop: false };
    const inter = ap.inter, a = ap.ap;
    const d = ap.tStop - agent.t;
    if (!agent.next && d < 60) agent.next = chooseConnector(agent, rng);
    if (agent.next && d < 30) agent.signal = agent.next.turn === 'L' ? 'L' : agent.next.turn === 'R' ? 'R' : null;
    const st = signals.stateFor(inter, a);
    if (st === 'red') return { stop: true, reason: 'red' };
    if (st === 'yellow') return { stop: d > agent.v * 1.2 + 2, reason: 'yellow' };
    if (st === 'green') {
      // unprotected left: yield to oncoming straight traffic close to the intersection
      if (agent.next && agent.next.turn === 'L' && d < 4 && oncomingNear(inter, a, 28)) return { stop: true, reason: 'yield' };
      return { stop: false };
    }
    if (a.stopSign) {
      if (agent.stopState === 'none' && d < 6 && agent.v < 0.3) { agent.stopState = 'stopped'; agent.stopT = 0; }
      if (agent.stopState === 'stopped') { agent.stopT += 1 / 60; if (agent.stopT > 1.4 && intersectionClear(inter, a)) agent.stopState = 'go'; }
      if (agent.stopState === 'go') return { stop: false };
      return { stop: true, reason: 'stopSign' };
    }
    // uncontrolled / priority approach: yield if the box is occupied by someone from another approach
    if (d < 6 && boxOccupiedByOthers(inter, a)) return { stop: true, reason: 'box' };
    return { stop: false };
  }
  function oncomingNear(inter, a, dist) {
    for (const o of inter.approaches) {
      if (o === a) continue;
      const dot = o.travelT.x * a.travelT.x + o.travelT.z * a.travelT.z;
      if (dot > -0.5) continue; // not oncoming
      for (const ag of o.queue || []) { if (ag.next && ag.next.turn !== 'R' && ag.dStop < dist && ag.v > 0.5) return true; }
    }
    return false;
  }
  function boxOccupiedByOthers(inter, a) { if (!inter.occupants) return false; for (const o of inter.occupants) if (!o.conn || o.conn.approach !== a) return true; return false; }
  function intersectionClear(inter, a) {
    if (boxOccupiedByOthers(inter, a)) return false;
    for (const o of inter.approaches) { if (o === a) continue; for (const ag of o.queue || []) { if (ag.dStop < 14 && ag.v > 1.0 && !o.stopSign) return false; if (ag.stopState === 'go' && ag.dStop < 6) return false; } }
    if (inter.playerInside) return false;
    return true;
  }

  // IDM acceleration toward a leader at `gap` metres closing at dv (my v − their v); v0 = desired speed
  function idm(v, v0, gap, dv) {
    const free = IDM.amax * (1 - Math.pow(v / Math.max(0.1, v0), 4));
    if (gap == null || gap === Infinity) return free;
    const sStar = IDM.s0 + Math.max(0, v * IDM.T + (v * dv) / (2 * Math.sqrt(IDM.amax * IDM.b)));
    return IDM.amax * (1 - Math.pow(v / Math.max(0.1, v0), 4) - Math.pow(sStar / Math.max(0.3, gap), 2));
  }
  // curvature-limited speed for the path ahead (slow for turns)
  function curveSpeed(agent) {
    if (agent.conn) return agent.conn.turn === 'S' ? 12 : agent.conn.turn === 'U' ? 4 : 6.5;
    if (agent.next) { const d = distToStop(agent); if (d < 20) return agent.next.turn === 'S' ? 13 : 7 + d * 0.4; }
    return Infinity;
  }
  function desiredSpeed(agent) { return Math.min(agent.seg.limitMph * MPH_TO_MPS * agent.speedFactor, curveSpeed(agent)); }

  return { advance, pose, lookAhead, distToStop, controlAt, idm, desiredSpeed, approachFor, chooseConnector, tFromS, sFromT, laneStartT };
}

// Routing over the lane graph (Dijkstra on (segment, lane) nodes through connectors) + turn instructions
// and a polyline for the nav screen.
import * as THREE from 'three';

export function createRouter(roads, driver) {
  // lane nodes: key → { seg, k, next: [connectors] }; cost = lane length / speed
  function laneCost(seg) { return seg.length / (seg.limitMph * 0.44704); }
  function laneEndPos(seg, k) { const ap = driver.approachFor(seg, k); const s = ap ? ap.ap.stopS : (k > 0 ? seg.length : 0); return roads.lanePoint(seg, k, s); }

  // route from a lane position to a destination lane (reach the destination segment on any lane heading toward tDest)
  function route(fromSeg, fromK, fromT, toSeg, toK) {
    const startKey = roads.laneKey(fromSeg, fromK), goalKeys = new Set();
    if (toK) goalKeys.add(roads.laneKey(toSeg, toK)); else { for (let k = 1; k <= toSeg.lanesF; k++) goalKeys.add(roads.laneKey(toSeg, k)); for (let k = 1; k <= toSeg.lanesB; k++) goalKeys.add(roads.laneKey(toSeg, -k)); }
    const dist = new Map(), prev = new Map(), open = [[0, startKey]];
    dist.set(startKey, 0);
    let found = null;
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, key] = open.shift();
      if (d > (dist.get(key) ?? Infinity)) continue;
      if (goalKeys.has(key)) { found = key; break; }
      const lane = roads.laneGraph.get(key);
      for (const c of lane.next) {
        const nk = roads.laneKey(c.to.seg, c.to.k);
        const nd = d + (key === startKey ? Math.max(0, (lane.seg.length - fromT)) / (lane.seg.limitMph * 0.44704) : laneCost(lane.seg)) + c.length / 6 + (c.turn === 'L' ? 8 : c.turn === 'R' ? 3 : c.turn === 'U' ? 40 : 0);
        if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, { key, conn: c }); open.push([nd, nk]); }
      }
    }
    if (!found) return null;
    const conns = []; let k = found;
    while (prev.has(k)) { const p = prev.get(k); conns.unshift(p.conn); k = p.key; }
    return { conns, lanes: [startKey, ...conns.map((c) => roads.laneKey(c.to.seg, c.to.k))], eta: dist.get(found) };
  }

  // polyline + turn list for the nav from the car's current lane position along the route
  function describe(r, fromSeg, fromK, fromT, toSeg, toT) {
    const pts = [];
    let seg = fromSeg, k = fromK, t = fromT;
    const turns = [];
    let acc = 0;
    const pushLane = (seg, k, t0, t1) => { const n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 6)); for (let i = 0; i <= n; i++) { const tt = t0 + (t1 - t0) * (i / n); pts.push(roads.lanePoint(seg, k, driver.sFromT(seg, k, tt))); } return Math.abs(t1 - t0); };
    for (const c of r.conns) {
      const ap = driver.approachFor(seg, k); const tEnd = ap ? ap.tStop : seg.length;
      acc += pushLane(seg, k, t, tEnd);
      if (c.turn !== 'S') turns.push({ dist: acc, turn: c.turn, street: c.to.seg.name, inter: c.inter });
      for (const p of c.pts) pts.push(p);
      acc += c.length;
      seg = c.to.seg; k = c.to.k; t = driver.laneStartT(c);
    }
    const tGoal = toT != null ? toT : (k > 0 ? seg.length : 0);
    acc += pushLane(seg, k, t, tGoal);
    turns.push({ dist: acc, turn: 'END', street: seg.name });
    return { pts, turns, total: acc };
  }
  return { route, describe };
}

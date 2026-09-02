// Road network: nodes + Catmull-Rom segments sampled every 2 m, virtual lanes, intersections with
// approaches / bezier connectors / signal groups, a spatial hash, and surfaceAt(x, z).
// Frame: x east, −z north, y up. Forward lanes (k > 0) lie to the RIGHT of the segment tangent (US driving).
import * as THREE from 'three';
import { clamp, sign } from '../units.js';

const SAMPLE = 2, CELL = 24;

export function createRoads() {
  const nodes = new Map(), segments = [], intersections = [], byName = new Map();
  const hash = new Map();
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

  function addNode(id, x, y, z, kind = 'auto') { const n = { id, p: new THREE.Vector3(x, y, z), kind, segs: [] }; nodes.set(id, n); return n; }
  function addSegment(o) {
    const a = nodes.get(o.a), b = nodes.get(o.b);
    if (!a || !b) throw new Error('segment ' + o.id + ' references missing node');
    const seg = {
      id: o.id, a, b, ctrl: (o.ctrl || []).map((c) => new THREE.Vector3(c[0], c[1], c[2])),
      type: o.type || 'street', lanesF: o.lanes || 1, lanesB: o.lanes || 1, laneW: o.laneW || (o.type === 'street' ? 3.2 : 3.5),
      shoulder: o.shoulder != null ? o.shoulder : (o.type === 'highway' ? 0.8 : o.type === 'avenue' ? 0.8 : o.type === 'street' ? 2.3 : 0.5),
      sidewalk: !!o.sidewalk, parking: !!o.parking, limitMph: o.limit || 25, tunnel: o.tunnel || null, bridge: o.bridge || null,
      rail: o.rail || null, name: o.name || o.id, tex: o.tex || null, samples: [], length: 0, hw: 0, index: segments.length, tunnelZ: o.tunnelZ || null, bridgeZ: o.bridgeZ || null,
    };
    seg.hw = seg.lanesF * seg.laneW + seg.shoulder;
    segments.push(seg); a.segs.push(seg); b.segs.push(seg);
    if (!byName.has(seg.name)) byName.set(seg.name, []); byName.get(seg.name).push(seg);
    return seg;
  }
  function setControl(nodeId, kind) { const n = nodes.get(nodeId); if (n) n.control = kind; }

  // ------------------------------------------------------------------ build
  const up = new THREE.Vector3(0, 1, 0);
  function build() {
    for (const seg of segments) {
      const pts = [seg.a.p.clone(), ...seg.ctrl, seg.b.p.clone()];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
      seg.curve = curve;
      const L = curve.getLength(); seg.length = L;
      const n = Math.max(2, Math.ceil(L / SAMPLE) + 1);
      seg.samples = [];
      for (let i = 0; i < n; i++) {
        const s = Math.min(L, i * SAMPLE);
        const u = s / L;
        const p = curve.getPointAt(u), t = curve.getTangentAt(u).normalize();
        const nrm = new THREE.Vector3().crossVectors(t, up).normalize();
        seg.samples.push({ p, t, n: nrm, s });
      }
      seg.samples[seg.samples.length - 1].s = L;
    }
    buildIntersections();
    // spatial hash of samples
    hash.clear();
    for (const seg of segments) seg.samples.forEach((sm, i) => { const k = key(sm.p.x, sm.p.z); if (!hash.has(k)) hash.set(k, []); hash.get(k).push([seg, i]); });
    buildLaneGraph();
  }

  // ------------------------------------------------------------------ intersections
  function buildIntersections() {
    intersections.length = 0;
    for (const node of nodes.values()) {
      if (node.segs.length < 2) { node.kind = node.segs.length === 1 ? 'end' : 'orphan'; continue; }
      const isJunction = node.segs.length >= 3 || node.control;
      const radius = isJunction ? Math.max(...node.segs.map((s) => s.hw)) + 2.0 : 0;
      const approaches = node.segs.map((seg) => {
        const atStart = seg.a === node;
        // traffic arriving at this node: if the segment starts here it arrives travelling backward (dir −1)
        const dir = atStart ? -1 : 1;
        const stopS = atStart ? Math.min(radius, seg.length / 2) : Math.max(seg.length - radius, seg.length / 2);
        const sm = sampleAt(seg, stopS);
        const travelT = sm.t.clone().multiplyScalar(dir);
        const group = Math.abs(travelT.z) >= Math.abs(travelT.x) ? 'NS' : 'EW';
        const inLanes = [], outLanes = [];
        for (let k = 1; k <= seg.lanesF; k++) { if (dir === 1) inLanes.push(k); else outLanes.push(k); }
        for (let k = 1; k <= seg.lanesB; k++) { if (dir === -1) inLanes.push(-k); else outLanes.push(-k); }
        return { seg, dir, stopS, travelT, group, inLanes, outLanes, angle: Math.atan2(-travelT.x, -travelT.z), stopSign: false };
      });
      approaches.sort((p, q) => p.angle - q.angle);
      const kind = node.control || (node.segs.length >= 3 ? 'stop4' : 'none');
      const inter = { id: node.id, node, kind, radius, approaches, connectors: [], signal: null };
      if (kind === 'stop4') approaches.forEach((a) => { a.stopSign = true; });
      if (kind === 'stop2') approaches.forEach((a) => { a.stopSign = a.group === 'EW'; }); // E-W traffic stops
      if (kind === 'signal') inter.signal = { phases: [{ green: 'NS', dur: 22 }, { yellow: 'NS', dur: 3.5 }, { allRed: true, dur: 1.5 }, { green: 'EW', dur: 18 }, { yellow: 'EW', dur: 3.5 }, { allRed: true, dur: 1.5 }], t: (node.id.length * 7.3) % 50, phase: 0 };
      // connectors: every incoming lane → every outgoing lane of every other approach (U-turn only at dead-end loops)
      for (const ai of approaches) for (const ki of ai.inLanes) {
        const P0 = lanePoint(ai.seg, ki, ai.stopS), T0 = ai.travelT;
        for (const ao of approaches) {
          if (ao === ai && approaches.length > 1) continue;
          for (const ko of ao.outLanes) {
            const outT = ao.travelT.clone().multiplyScalar(-1); // leaving the node
            const P3 = lanePoint(ao.seg, ko, ao.stopS);
            const d = P0.distanceTo(P3);
            const cr = T0.x * outT.z - T0.z * outT.x; // y-component of T0 × outT (positive = left)
            const dot = T0.x * outT.x + T0.z * outT.z;
            const turn = dot < -0.6 ? 'U' : cr > 0.45 ? 'L' : cr < -0.45 ? 'R' : 'S';
            // lane discipline: right turns from the rightmost lane, left turns from the leftmost, straight any → matching index
            const inIdx = ai.inLanes.indexOf(ki), outIdx = ao.outLanes.indexOf(ko);
            if (turn === 'S' && ai.inLanes.length > 1 && ao.outLanes.length > 1 && inIdx !== outIdx) continue;
            if (turn === 'R' && inIdx !== 0) continue;
            if (turn === 'L' && inIdx !== ai.inLanes.length - 1) continue;
            const pts = [];
            if (d < 0.5) pts.push(P0.clone(), P3.clone());
            else {
              const P1 = P0.clone().addScaledVector(T0, d * 0.4), P2 = P3.clone().addScaledVector(outT, -d * 0.4);
              const bez = new THREE.CubicBezierCurve3(P0, P1, P2, P3);
              const n = Math.max(2, Math.ceil(bez.getLength()));
              for (let i = 0; i <= n; i++) pts.push(bez.getPointAt(i / n));
            }
            const conn = { from: { seg: ai.seg, k: ki }, to: { seg: ao.seg, k: ko }, turn, group: ai.group, pts, length: 0, inter, approach: ai, outApproach: ao };
            for (let i = 1; i < pts.length; i++) conn.length += pts[i].distanceTo(pts[i - 1]);
            inter.connectors.push(conn);
          }
        }
      }
      // wheel-friendly: yield on left turns unless protected — handled by the driver
      intersections.push(inter);
      node.inter = inter;
    }
  }

  // ------------------------------------------------------------------ lane graph (for AI + routing)
  const laneGraph = new Map(); // key `${seg.index}|${k}` → { seg, k, next: [connector...] }
  function laneKey(seg, k) { return `${seg.index}|${k}`; }
  function buildLaneGraph() {
    laneGraph.clear();
    for (const seg of segments) { for (let k = 1; k <= seg.lanesF; k++) laneGraph.set(laneKey(seg, k), { seg, k, next: [] }); for (let k = 1; k <= seg.lanesB; k++) laneGraph.set(laneKey(seg, -k), { seg, k: -k, next: [] }); }
    for (const inter of intersections) for (const c of inter.connectors) laneGraph.get(laneKey(c.from.seg, c.from.k)).next.push(c);
  }

  // ------------------------------------------------------------------ sampling
  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3();
  function sampleAt(seg, s, out) {
    s = clamp(s, 0, seg.length);
    const sm = seg.samples;
    let i = Math.min(sm.length - 2, Math.floor(s / SAMPLE)); if (i < 0) i = 0;
    const a = sm[i], b = sm[i + 1];
    const f = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
    out = out || { p: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3() };
    out.p.lerpVectors(a.p, b.p, f);
    out.t.lerpVectors(a.t, b.t, f).normalize();
    out.n.crossVectors(out.t, up).normalize();
    out.s = s;
    return out;
  }
  function laneOffset(seg, k) { return sign(k) * (Math.abs(k) - 0.5) * seg.laneW; }
  function lanePoint(seg, k, s, out) { const sm = sampleAt(seg, s); out = out || new THREE.Vector3(); return out.copy(sm.p).addScaledVector(sm.n, laneOffset(seg, k)); }
  // travelling direction along lane k at s
  function laneDir(seg, k, s, out) { const sm = sampleAt(seg, s); out = out || new THREE.Vector3(); return out.copy(sm.t).multiplyScalar(k > 0 ? 1 : -1); }

  // ------------------------------------------------------------------ surfaceAt
  const result = { onRoad: false, height: 0, surface: 'asphalt', seg: null, s: 0, lateral: 0, laneIndex: 0, laneDir: 1, limitMph: 25, inIntersection: false, tunnel: false, bridge: false, inter: null, tx: 0, tz: 1, name: '' };
  const q = new THREE.Vector3();
  function surfaceAt(x, z) {
    const r = result;
    r.onRoad = false; r.inIntersection = false; r.tunnel = false; r.bridge = false; r.inter = null; r.seg = null; r.name = '';
    // intersection patches first
    for (const inter of intersections) {
      if (inter.radius <= 0) continue;
      const dx = x - inter.node.p.x, dz = z - inter.node.p.z;
      if (dx * dx + dz * dz <= inter.radius * inter.radius) {
        r.onRoad = true; r.inIntersection = true; r.inter = inter; r.height = inter.node.p.y; r.surface = 'asphalt';
        r.limitMph = inter.approaches[0].seg.limitMph; r.name = inter.approaches[0].seg.name; r.lateral = 0; r.laneIndex = 0;
        return r;
      }
    }
    let best = null, bestD = 1e9, bestS = 0, bestY = 0, bestT = null;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = hash.get(`${cx + i},${cz + j}`); if (!list) continue;
      for (const [seg, idx] of list) {
        const sm = seg.samples;
        for (const jj of [idx - 1, idx]) {
          if (jj < 0 || jj + 1 >= sm.length) continue;
          const a = sm[jj].p, b = sm[jj + 1].p;
          const ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez; if (len2 < 1e-9) continue;
          const tRaw = ((x - a.x) * ex + (z - a.z) * ez) / len2;
          if (tRaw < -0.3 || tRaw > 1.3) continue; // the point is beyond this chord along the road
          const t = clamp(tRaw, 0, 1);
          const px = a.x + ex * t, pz = a.z + ez * t;
          const n = sm[jj].n;
          const d = (x - px) * n.x + (z - pz) * n.z;
          const ad = Math.abs(d);
          const limit = seg.hw + (seg.sidewalk ? 2.4 : 0) + 0.3;
          if (ad <= limit && ad < bestD) { best = seg; bestD = ad; bestS = sm[jj].s + t * (sm[jj + 1].s - sm[jj].s); bestY = a.y + (b.y - a.y) * t; bestT = sm[jj].t; r.lateral = d; }
        }
      }
    }
    if (!best) { r.height = 0; r.lateral = 0; r.laneIndex = 0; return r; }
    const seg = best, d = r.lateral, ad = Math.abs(d);
    r.seg = seg; r.s = bestS; r.limitMph = seg.limitMph; r.name = seg.name; r.tx = bestT.x; r.tz = bestT.z;
    if (ad <= seg.hw) {
      r.onRoad = true; r.surface = 'asphalt';
      r.height = bestY + 0.03 - 0.012 * ad; // slight crown
      const li = Math.min(Math.floor(ad / seg.laneW) + 1, sign(d) > 0 ? seg.lanesF : seg.lanesB);
      r.laneIndex = sign(d) >= 0 ? li : -li; r.laneDir = sign(d) >= 0 ? 1 : -1;
    } else {
      // sidewalk / curb strip
      r.onRoad = false; r.surface = 'concrete'; r.height = bestY + 0.15; r.laneIndex = 0;
    }
    if (seg.tunnel && bestS >= seg.tunnel[0] && bestS <= seg.tunnel[1]) r.tunnel = true;
    if (seg.bridge && bestS >= seg.bridge[0] && bestS <= seg.bridge[1]) r.bridge = true;
    return r;
  }

  // nearest road point for terrain flattening: returns { dist, y, seg, s } or null within maxD
  function nearest(x, z, maxD) {
    let bd = maxD, by = 0, bs = 0, bseg = null;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), n = Math.ceil(maxD / CELL);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const list = hash.get(`${cx + i},${cz + j}`); if (!list) continue;
      for (const [seg, idx] of list) {
        const sm = seg.samples;
        if (idx + 1 >= sm.length) continue;
        const a = sm[idx].p, b = sm[idx + 1].p;
        const ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez; if (len2 < 1e-9) continue;
        const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / len2, 0, 1);
        const px = a.x + ex * t, pz = a.z + ez * t;
        const dd = Math.hypot(x - px, z - pz) - seg.hw;
        if (dd < bd) { bd = dd; by = a.y + (b.y - a.y) * t; bs = sm[idx].s + t * SAMPLE; bseg = seg; }
      }
    }
    return bseg ? { dist: Math.max(0, bd), y: by, seg: bseg, s: bs } : null;
  }

  return { nodes, segments, intersections, byName, laneGraph, laneKey, addNode, addSegment, setControl, build, sampleAt, lanePoint, laneDir, laneOffset, surfaceAt, nearest, SAMPLE, CELL };
}

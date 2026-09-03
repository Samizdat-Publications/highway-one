// Game modes: free roam, deliveries (routing + timer + earnings), driving test (rules scoring + report card),
// time trials (checkpoint courses + best times). One active mode; each gets enter/exit/update/onEvent.
import * as THREE from 'three';
import { clamp, fmtTime, fmtDist, MPH_TO_MPS } from '../units.js';
import { createRng } from '../rng.js';

const STOPS = [
  { name: 'Pelican Pier', seg: 'pier0', t: 0.7 }, { name: 'Main St Market', seg: 'ew-35_2', t: 0.5 }, { name: 'Palm Ave Diner', seg: 'ew-175_3', t: 0.5 },
  { name: 'Marina Way Hotel', seg: 'ew175_1', t: 0.5 }, { name: 'Cabrillo Clinic', seg: 'ew-105_4', t: 0.5 }, { name: 'Seaview Apartments', seg: 'ew35_3', t: 0.5 },
  { name: 'North Beach Lot', seg: 'sb1', t: 0.4 }, { name: 'Canyon Overlook', seg: 'ov1', t: 0.4 }, { name: '4th St Garage', seg: 'ns320_2', t: 0.5 }, { name: 'PCH Turnout', seg: 'pchN0', t: 0.55 },
];
const COURSES = [
  { name: 'Town Loop', limitless: false, pts: [['ocean2', 0.5], ['ew-35_2', 0.5], ['ns230_2', 0.5], ['ew105_1', 0.5], ['ocean4', 0.5]] },
  { name: 'Cliff Run', pts: [['pchN0', 0.15], ['pchN0', 0.9], ['pchN1', 0.5], ['pchN1', 0.95]] },
  { name: 'Canyon Pass', pts: [['canyon', 0.05], ['canyon', 0.5], ['canyon', 0.95]] },
];

export function createModes({ game, car, roads, driver, router, nav, hud, events, rules, save, traffic, menu }) {
  const rng = createRng(0xdeadbeef);
  const segById = (id) => roads.segments.find((s) => s.id === id);
  const posOn = (seg, frac) => { const s = seg.length * frac; return { seg, s, pos: roads.sampleAt(seg, s).p.clone() }; };
  const here = () => roads.surfaceAt(car.S.x, car.S.z);
  const distTo = (p) => Math.hypot(p.x - car.S.x, p.z - car.S.z);

  // ---------------------------------------------------------------- routing helper (recomputes every ~1 s)
  function routeTo(target) {
    const h = here(); if (!h.seg || !h.laneIndex) return null;
    const t = driver.tFromS(h.seg, h.laneIndex, h.s);
    const r = router.route(h.seg, h.laneIndex, t, target.seg, null);
    if (!r) return null;
    // lane on the destination: the last lane in the route; travel-distance of the target on it
    const lastKey = r.lanes[r.lanes.length - 1]; const lane = roads.laneGraph.get(lastKey);
    const tGoal = driver.tFromS(lane.seg, lane.k, target.s);
    const d = router.describe(r, h.seg, h.laneIndex, t, lane.seg, tGoal);
    return { r, d };
  }
  function turnIcon(t) { return t === 'L' ? '↰' : t === 'R' ? '↱' : t === 'U' ? '↶' : t === 'END' ? '◉' : '↑'; }
  function turnText(tn) { return tn.turn === 'END' ? 'ARRIVE' : tn.turn === 'L' ? `LEFT onto ${tn.street}` : tn.turn === 'R' ? `RIGHT onto ${tn.street}` : tn.turn === 'U' ? 'U-TURN' : 'CONTINUE'; }

  // ---------------------------------------------------------------- modes
  const freeroam = {
    name: 'FREE ROAM',
    enter() { hud.setObjective('Cruise Pelican Point and Highway One. M cycles modes from the menu.'); hud.setTimer(''); nav.setRoute(null, null); nav.S.poi = []; },
    exit() {}, update() {}, onEvent() {},
  };

  const delivery = {
    name: 'DELIVERIES', job: null, earnings: 0, done: 0, routeT: 0,
    enter() { this.earnings = save.get('earnings', 0); this.done = 0; this.newJob(); },
    exit() { nav.setRoute(null, null); nav.S.poi = []; hud.setTimer(''); },
    newJob() {
      const h = here();
      const cands = STOPS.map((s) => ({ ...s, ...posOn(segById(s.seg), s.t) })).filter((s) => s.seg && distTo(s.pos) > 250);
      const pick = cands[Math.floor(rng() * cands.length)] || STOPS[0];
      this.job = { dest: pick, t: 0, par: 0, dist0: car.S.odometer };
      const rt = routeTo(pick);
      this.job.par = rt ? rt.d.total / (11 * 1) + 25 : 120; // par ≈ 25 mph average + slack
      nav.S.poi = [{ x: pick.pos.x, z: pick.pos.z, color: '#ff7a3c' }];
      hud.setObjective(`Deliver to ${pick.name}. Follow the nav.`);
      hud.toast(`NEW DELIVERY · ${pick.name.toUpperCase()}`, 'good', 3);
      this.routeT = 9;
    },
    update(dt) {
      const j = this.job; if (!j) return;
      j.t += dt; this.routeT += dt;
      hud.setTimer(`${fmtTime(j.t)}  ·  par ${fmtTime(j.par)}  ·  $${this.earnings}`);
      if (this.routeT > 1) {
        this.routeT = 0;
        const rt = routeTo(j.dest);
        if (rt) { const next = rt.d.turns[0]; nav.setRoute(rt.d.pts, next ? { icon: turnIcon(next.turn), text: turnText(next), dist: next.dist } : null, `${Math.ceil(rt.r.eta / 60)} min`); }
        else nav.setRoute(null, { icon: '?', text: 'NO ROUTE — find a road', dist: 0 }, '');
      }
      if (distTo(j.dest.pos) < 14 && car.S.speed < 1.5) {
        const bonus = j.t < j.par ? 25 : 0; const pay = 40 + Math.round((car.S.odometer - j.dist0) * 12) + bonus;
        this.earnings += pay; this.done++; save.set('earnings', this.earnings);
        hud.toast(`DELIVERED · +$${pay}${bonus ? ' (on time)' : ''}`, 'good', 3.5);
        this.newJob();
      }
    },
    onEvent(type) { if (type === 'collision' && this.job) { this.earnings = Math.max(0, this.earnings - 15); hud.toast('DAMAGE · −$15', 'bad', 2); } },
  };

  const rulesMode = {
    name: 'DRIVING TEST', score: 100, faults: [], t: 0, dist0: 0, duration: 240,
    enter() { this.score = 100; this.faults = []; this.t = 0; this.dist0 = car.S.odometer; this.finished = false; hud.setObjective('Drive for 4 minutes. Obey limits, lights, stop signs; signal your turns; stay in lane.'); hud.hideReport(); },
    exit() { hud.setTimer(''); hud.hideReport(); },
    update(dt) {
      if (this.finished) return;
      this.t += dt; hud.setTimer(`${fmtTime(Math.max(0, this.duration - this.t))}  ·  score ${this.score}`);
      if (this.t >= this.duration) this.finish();
    },
    fault(label, pts) { this.score = Math.max(0, this.score - pts); this.faults.push([label, pts]); hud.toast(`${label}  −${pts}`, 'bad', 2.2); },
    onEvent(type, d) {
      if (this.finished) return;
      if (type === 'speeding') this.fault(`SPEEDING ${Math.round(d.mph)} IN A ${d.limit}`, 5);
      if (type === 'redLight') this.fault('RAN A RED LIGHT', 20);
      if (type === 'stopSign') this.fault('ROLLED A STOP SIGN', 10);
      if (type === 'noSignal') this.fault('TURN WITHOUT SIGNAL', 4);
      if (type === 'laneDepart') this.fault('CROSSED INTO ONCOMING LANE', 6);
      if (type === 'offRoad') this.fault('LEFT THE ROAD', 5);
      if (type === 'collision') this.fault(`COLLISION (${d.tag})`, d.speed > 5 ? 25 : 12);
    },
    finish() {
      this.finished = true;
      const miles = car.S.odometer - this.dist0;
      const grade = this.score >= 90 ? 'A' : this.score >= 80 ? 'B' : this.score >= 70 ? 'C' : this.score >= 60 ? 'D' : 'F';
      const best = save.get('testBest', 0); if (this.score > best) save.set('testBest', this.score);
      const rows = [['DISTANCE', `${miles.toFixed(2)} mi`], ['FAULTS', String(this.faults.length)], ...this.faults.slice(0, 8).map(([l, p]) => [l, `−${p}`]), ['BEST', String(Math.max(best, this.score))]];
      hud.showReport({ title: 'DRIVING TEST RESULT', grade: `${grade}  ${this.score}`, gradeColor: grade === 'F' ? '#e76f51' : grade === 'A' ? '#2a9d8f' : '#f4a261', rows, button: { label: 'DRIVE AGAIN', onClick: () => { hud.hideReport(); this.enter(); } } });
    },
  };

  const timetrial = {
    name: 'TIME TRIAL', course: null, idx: 0, t: 0, running: false, splits: [],
    enter() { this.pickCourse(0); },
    exit() { nav.S.poi = []; nav.setRoute(null, null); hud.setTimer(''); hud.hideReport(); },
    pickCourse(i) {
      const c = COURSES[i % COURSES.length]; this.courseIdx = i % COURSES.length;
      this.course = { ...c, cps: c.pts.map(([id, f]) => posOn(segById(id), f)) };
      this.idx = 0; this.t = 0; this.running = false; this.splits = [];
      const best = save.get('tt_' + c.name, null);
      hud.setObjective(`${c.name}: drive to the first checkpoint to start. Best: ${best ? fmtTime(best) : '--'}`);
      this.refreshNav();
    },
    refreshNav() { const cp = this.course.cps[this.idx]; nav.S.poi = this.course.cps.map((c, i) => ({ x: c.pos.x, z: c.pos.z, color: i === this.idx ? '#ff7a3c' : i < this.idx ? '#2a9d8f' : '#8fa3ad' })); const d = distTo(cp.pos); nav.setRoute(null, { icon: '◉', text: `CHECKPOINT ${this.idx + 1}/${this.course.cps.length}`, dist: d }, ''); },
    update(dt) {
      if (!this.course) return;
      if (this.running) { this.t += dt; hud.setTimer(fmtTime(this.t)); }
      const cp = this.course.cps[this.idx];
      const d = distTo(cp.pos);
      if (Math.floor(this.t * 4) % 2 === 0) this.refreshNav();
      if (d < 12) {
        if (this.idx === 0 && !this.running) { this.running = true; this.t = 0; hud.toast('GO!', 'good', 1.2); }
        else if (this.running) { this.splits.push(this.t); hud.toast(`SPLIT ${fmtTime(this.t)}`, '', 1.5); }
        this.idx++;
        if (this.idx >= this.course.cps.length) this.finish(); else this.refreshNav();
      }
    },
    finish() {
      this.running = false;
      const key = 'tt_' + this.course.name, best = save.get(key, null);
      const isBest = !best || this.t < best; if (isBest) save.set(key, this.t);
      hud.showReport({ title: this.course.name.toUpperCase(), grade: fmtTime(this.t), gradeColor: isBest ? '#2a9d8f' : '#f4f1de', rows: [...this.splits.map((s, i) => [`CHECKPOINT ${i + 1}`, fmtTime(s)]), ['BEST', fmtTime(isBest ? this.t : best)], [isBest ? 'NEW RECORD' : '', isBest ? '★' : '']], button: { label: 'NEXT COURSE', onClick: () => { hud.hideReport(); this.pickCourse(this.courseIdx + 1); } } });
    },
    onEvent() {},
  };

  const all = { freeroam, delivery, rules: rulesMode, timetrial };
  let active = null;
  function set(name) { if (active) active.exit(); active = all[name] || freeroam; game.mode = name; hud.setMode(active.name); active.enter(); }
  function update(dt) { if (active) active.update(dt); }
  for (const type of ['speeding', 'redLight', 'stopSign', 'noSignal', 'laneDepart', 'offRoad', 'collision', 'intersection']) events.on(type, (d) => { if (active) active.onEvent(type, d); });
  return { set, update, all, get active() { return active; } };
}

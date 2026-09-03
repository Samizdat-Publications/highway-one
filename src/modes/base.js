// Mode interface + the driving event bus (collisions, red lights, stop signs, speeding, lane departures).
// The rules monitor raises the events; modes consume them.
import { clamp } from '../units.js';

export function createEvents() {
  const listeners = new Map();
  function on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); return () => { const l = listeners.get(type); const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; }
  function emit(type, data) { const l = listeners.get(type); if (l) for (const fn of l.slice()) fn(data); }
  return { on, emit };
}

// Watches the player's driving and emits: speeding, redLight, stopSign, noSignal, laneDepart, collision, offRoad.
export function createRulesMonitor(events, car, roads, signals, driver, collide) {
  const S = { speedingT: 0, lastInter: null, approachSeen: null, stoppedAtSign: false, wasRed: false, laneT: 0, offRoadT: 0, lastCollision: null, lastSignalUse: null, minApproachSpeed: 99, enteredOn: null };
  function update(dt, here) {
    const C = car.S, v = C.speed, mph = C.speedMph;
    // speeding: > limit + 5 for 3 s continuously
    if (here.onRoad && mph > here.limitMph + 5) { S.speedingT += dt; if (S.speedingT > 3) { events.emit('speeding', { mph, limit: here.limitMph }); S.speedingT = -12; } } else if (S.speedingT > 0) S.speedingT = 0; else S.speedingT = Math.min(0, S.speedingT + dt);
    // intersections: track the approach we are on and what we did at its stop line
    if (here.seg && here.laneIndex && !here.inIntersection) {
      const apx = driver.approachFor(here.seg, here.laneIndex);
      if (apx) {
        const t = driver.tFromS(here.seg, here.laneIndex, here.s), d = apx.tStop - t;
        if (d < 40 && d > -2) {
          if (S.approachSeen !== apx.ap) { S.approachSeen = apx.ap; S.minApproachSpeed = 99; S.wasRed = false; S.signalOnApproach = null; }
          S.minApproachSpeed = Math.min(S.minApproachSpeed, v);
          const st = signals.stateFor(apx.inter, apx.ap);
          if (st === 'red' && d < 8 && d > 0) S.wasRed = true;
          if (C.lights.signal) S.signalOnApproach = C.lights.signal;
        }
      }
    } else if (here.inIntersection && here.inter && S.approachSeen && here.inter === S.approachSeen.seg.a.inter || (here.inIntersection && here.inter && S.approachSeen && here.inter === S.approachSeen.seg.b.inter)) {
      if (S.enteredOn !== here.inter) {
        S.enteredOn = here.inter;
        const ap = S.approachSeen;
        const st = signals.stateFor(here.inter, ap);
        if (st === 'red' && S.wasRed) events.emit('redLight', { inter: here.inter });
        if (ap.stopSign && S.minApproachSpeed > 0.8) events.emit('stopSign', { inter: here.inter, minSpeed: S.minApproachSpeed });
        S.pendingTurnCheck = { inter: here.inter, ap, signal: S.signalOnApproach, yaw0: C.yaw };
      }
    }
    if (!here.inIntersection && S.enteredOn && S.pendingTurnCheck) {
      const p = S.pendingTurnCheck; S.pendingTurnCheck = null; S.enteredOn = null; S.approachSeen = null;
      let dyaw = C.yaw - p.yaw0; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const turned = Math.abs(dyaw) > 0.6 ? (dyaw > 0 ? 'L' : 'R') : null;
      if (turned && p.signal !== turned) events.emit('noSignal', { turn: turned });
      events.emit('intersection', { turn: turned, inter: p.inter });
    }
    // lane keeping: crossing into an oncoming lane (lateral on the wrong side) for > 1.5 s, or two wheels off the road
    if (here.onRoad && !here.inIntersection && here.seg) {
      const wrongSide = here.laneDir === -1 && Math.abs(here.lateral) > 1.0 && here.seg.lanesB > 0 && here.seg.type !== 'lot';
      // laneDir −1 means we are on the left (backward) lanes relative to the segment; that is the oncoming side only if we travel along +t
      const travellingFwd = (-Math.sin(C.yaw)) * here.tx + (-Math.cos(C.yaw)) * here.tz > 0;
      const oncoming = (here.laneDir === -1 && travellingFwd) || (here.laneDir === 1 && !travellingFwd);
      if (oncoming && v > 2) { S.laneT += dt; if (S.laneT > 1.5) { events.emit('laneDepart', { kind: 'oncoming' }); S.laneT = -8; } } else if (S.laneT > 0) S.laneT = 0; else S.laneT = Math.min(0, S.laneT + dt);
      S.offRoadT = 0;
    } else if (!here.onRoad && v > 2) { S.offRoadT += dt; if (S.offRoadT > 1.2) { events.emit('offRoad', {}); S.offRoadT = -10; } }
    // collisions
    if (C.lastCollision && C.lastCollision !== S.lastCollision) { S.lastCollision = C.lastCollision; if (C.lastCollision.speed > 0.8) events.emit('collision', { speed: C.lastCollision.speed, tag: C.lastCollision.tag }); }
  }
  return { S, update };
}

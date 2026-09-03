// Autopilot for soak tests: drives the player car along lanes with the same rules as traffic.
// Install with `__game.bot.start()` (sets window.__botStep); stop with `__game.bot.stop()`.
import * as THREE from 'three';
import { clamp, DEG, MPH_TO_MPS, wrapAngle } from '../units.js';
import { createRng } from '../rng.js';

export function createBot(game, car, roads, driver, traffic, input) {
  const rng = createRng(0x60b0);
  const agent = { seg: null, k: 1, t: 0, conn: null, ct: 0, next: null, v: 0, speedFactor: 0.95, pos: new THREE.Vector3(), dir: new THREE.Vector3(), stopState: 'none', stopT: 0, dStop: Infinity, len: 4.5, active: true, id: -1, isPlayer: true };
  const look = new THREE.Vector3(), lookDir = new THREE.Vector3();
  const S = { on: false, steps: 0, collisions: 0, maxSpeed: 0, redRuns: 0, stuckT: 0, dist0: 0, log: [] };

  function snapToLane() {
    const here = roads.surfaceAt(car.S.x, car.S.z);
    if (here.seg && here.laneIndex) { agent.seg = here.seg; agent.k = here.laneIndex; agent.t = driver.tFromS(here.seg, here.laneIndex, here.s); agent.conn = null; agent.ct = 0; agent.next = null; return true; }
    return false;
  }
  function step(dt) {
    if (!S.on) return;
    S.steps++;
    if (!agent.seg && !snapToLane()) return;
    // keep the agent glued to the car's progress: advance by the car's forward speed
    agent.v = Math.max(0, car.S.vFwd);
    driver.advance(agent, agent.v * dt, rng);
    if (agent.dead) { snapToLane(); }
    driver.pose(agent, agent.pos, agent.dir);
    // resync if the car drifted far from the path (e.g. after a collision)
    if (agent.pos.distanceTo(new THREE.Vector3(car.S.x, agent.pos.y, car.S.z)) > 6) snapToLane();
    // steering: pure pursuit on a point ahead
    const ahead = clamp(6 + car.S.speed * 0.9, 6, 30);
    driver.lookAhead(agent, ahead, look, lookDir);
    const dx = look.x - car.S.x, dz = look.z - car.S.z;
    const targetYaw = Math.atan2(-dx, -dz);
    const err = wrapAngle(targetYaw - car.S.yaw);
    const steer = clamp(-err * 2.2 * (1 / (1 + car.S.speed / 25)), -1, 1); // + = right; positive yaw error means the target is to the left
    // longitudinal: same rules as traffic (leader gap comes from traffic's lists via a synthetic check)
    const ctl = driver.controlAt(agent, rng);
    const dStop = driver.distToStop(agent);
    const v0 = driver.desiredSpeed(agent);
    let gap = null, lv = 0;
    for (const o of traffic.agents) { if (!o.active) continue; const ox = o.pos.x - car.S.x, oz = o.pos.z - car.S.z; const fwd = -ox * Math.sin(car.S.yaw) - oz * Math.cos(car.S.yaw); const side = ox * Math.cos(car.S.yaw) - oz * Math.sin(car.S.yaw); if (fwd > 0 && fwd < 45 && Math.abs(side) < 2.4) { const g = fwd - 4.5; if (gap == null || g < gap) { gap = g; lv = o.v; } } }
    let a = driver.idm(car.S.speed, v0, gap, car.S.speed - lv);
    if (ctl.stop && dStop !== Infinity) a = Math.min(a, driver.idm(car.S.speed, v0, Math.max(0.05, dStop + 1.5), car.S.speed));
    const throttle = a > 0 ? clamp(a / 2.2, 0, 1) * 0.8 : 0;
    const brake = a < -0.3 ? clamp(-a / 4, 0, 1) : 0;
    input.override = { throttle, brake, steer, clutch: 0, handbrake: 0 };
    // stats
    S.maxSpeed = Math.max(S.maxSpeed, car.S.speedMph);
    if (car.S.lastCollision && car.S.lastCollision !== S.lastHit) { S.lastHit = car.S.lastCollision; S.collisions++; }
    if (car.S.speed < 0.3) S.stuckT += dt; else S.stuckT = 0;
    for (const k of ['x', 'z', 'vx', 'vz', 'yaw']) if (!Number.isFinite(car.S[k])) { S.nan = true; stop(); }
  }
  function start() { S.on = true; S.steps = 0; S.collisions = 0; S.maxSpeed = 0; S.stuckT = 0; S.nan = false; S.dist0 = car.S.odometer; snapToLane(); window.__botStep = step; if (car.drivetrain.S.mode === 'auto' && car.drivetrain.S.sel !== 'D') { car.drivetrain.S.sel = 'D'; car.drivetrain.S.gear = 1; car.drivetrain.S.G = car.drivetrain.ratio(1); } }
  function stop() { S.on = false; window.__botStep = undefined; input.override = null; }
  function report() { return { steps: S.steps, miles: (car.S.odometer - S.dist0).toFixed(2), collisions: S.collisions, maxMph: S.maxSpeed.toFixed(0), stuckT: S.stuckT.toFixed(1), nan: !!S.nan, speed: car.S.speedMph.toFixed(0), at: [car.S.x.toFixed(0), car.S.z.toFixed(0)], seg: agent.seg && agent.seg.name, conn: agent.conn ? agent.conn.turn : null }; }
  return { S, agent, start, stop, report, step };
}

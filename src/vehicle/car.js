// The car body: 2-D rigid body (x, z, yaw) on a height-queried surface, four wheels with load transfer,
// steering, brakes/ABS/handbrake, aero, slope, visual suspension, odometer. One `step(dt, I)` per sim tick.
import { clamp, lerp, sign, damp, spring2, moveToward, DEG, G, MPS_TO_MPH, M_TO_MI, RAD_TO_RPM } from '../units.js';
import { createEngine } from './engine.js';
import { createDrivetrain } from './drivetrain.js';
import { createTyreModel } from './tyres.js';

export function createCar(C, surface) {
  const engine = createEngine(C);
  const drivetrain = createDrivetrain(C, engine);
  const tyres = createTyreModel(C);
  const a = C.wheelbase * (1 - C.frontWeight), b = C.wheelbase * C.frontWeight; // CG to front / rear axle
  const halfTrack = C.track / 2;
  const mShare = C.mass / 4;

  const mkWheel = (u, w, front) => ({
    u, w, front, omega: 0, r: C.wheelRadius, J: C.wheelInertia, Jextra: 0, mShare,
    Fz: 0, mu: 1, vwx: 0, vwy: 0, kf: 0, af: 0, kappa: 0, alpha: 0, Fx: 0, Fy: 0, Tdrive: 0, Tbrake: 0,
    steer: 0, height: 0, surface: 'asphalt', onRoad: true, absCut: false, lockedWheel: false, gripUse: 0, spin: 0,
    wx: 0, wz: 0,
  });
  const wheels = [mkWheel(a, -halfTrack, true), mkWheel(a, halfTrack, true), mkWheel(-b, -halfTrack, false), mkWheel(-b, halfTrack, false)];
  const driveWheels = C.drive === 'front' ? [wheels[0], wheels[1]] : [wheels[2], wheels[3]];

  const S = {
    x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0, yawRate: 0,
    vFwd: 0, vLat: 0, ax: 0, ay: 0, axF: 0, ayF: 0, speed: 0, speedMph: 0,
    steerWheelDeg: 0, steerTarget: 0, throttle: 0, brake: 0, clutch: 0, handbrake: 0,
    groundPitch: 0, groundRoll: 0,
    body: { pitch: { x: 0, v: 0 }, roll: { x: 0, v: 0 }, heave: { x: 0, v: 0 }, pitchOut: 0, rollOut: 0, heaveOut: 0 },
    abs: { active: false, phase: 0 },
    odometer: 12873.4, trip: 0, fuelWarn: false,
    wheels, engine: engine.S, drive: drivetrain.S,
    collisions: [], lastCollision: 0,
    lights: { low: false, high: false, signal: null, hazards: false, blinkOn: false, blinkT: 0, brake: false, reverse: false, dome: false },
    wipers: { mode: 0, phase: 0, moving: false },
    seatbelt: false, hornOn: false, ignitionHeld: 0,
    stepCount: 0, wetness: 0,
    sinYaw: 0, cosYaw: 1,
  };

  // ------------------------------------------------------------------ helpers
  function fwd() { return [-Math.sin(S.yaw), -Math.cos(S.yaw)]; }   // world x,z
  function right() { return [Math.cos(S.yaw), -Math.sin(S.yaw)]; }
  function worldOfLocal(u, w) { const f = fwd(), r = right(); return [S.x + f[0] * u + r[0] * w, S.z + f[1] * u + r[1] * w]; }

  function teleport(x, z, yaw) {
    S.x = x; S.z = z; S.yaw = yaw; S.vx = S.vz = S.yawRate = 0; S.ax = S.ay = S.axF = S.ayF = 0;
    for (const w of wheels) { w.omega = 0; w.kf = w.af = 0; w.Fx = w.Fy = 0; }
    const q = surface.surfaceAt(x, z, S.y);
    S.y = q.height; S.groundPitch = S.groundRoll = 0;
    for (const k of ['pitch', 'roll', 'heave']) { S.body[k].x = 0; S.body[k].v = 0; }
    S.body.heave.x = S.y;
  }

  // ------------------------------------------------------------------ main step
  function step(dt, I) {
    S.stepCount++;
    S.throttle = I.throttle; S.brake = I.brake; S.clutch = I.clutch; S.handbrake = I.handbrake;
    drivetrain.S.clutchPos = I.clutch;
    S.speed = Math.hypot(S.vx, S.vz);

    // --- steering wheel
    S.steerTarget = clamp(I.steerDeg, -C.lockToLock / 2, C.lockToLock / 2);
    if (I.steerAnalog != null) S.steerWheelDeg = damp(S.steerWheelDeg, S.steerTarget, 40, dt);
    else S.steerWheelDeg = S.steerTarget;
    const delta = (S.steerWheelDeg / C.steerRatio) * DEG; // road wheel angle, + = right
    wheels[0].steer = wheels[1].steer = delta;

    // --- ground query under each wheel
    const f = fwd(), r = right();
    let hSum = 0;
    for (const w of wheels) {
      w.wx = S.x + f[0] * w.u + r[0] * w.w; w.wz = S.z + f[1] * w.u + r[1] * w.w;
      const q = surface.surfaceAt(w.wx, w.wz, S.y);
      w.height = q.height; w.surface = q.surface; w.onRoad = q.onRoad;
      const muBase = C.mu[q.surface] != null ? C.mu[q.surface] : 0.8;
      w.mu = q.surface === 'asphalt' || q.surface === 'concrete' ? lerp(muBase, C.mu.wet, S.wetness) : muBase;
      hSum += w.height;
    }
    const hF = (wheels[0].height + wheels[1].height) / 2, hR = (wheels[2].height + wheels[3].height) / 2;
    const hL = (wheels[0].height + wheels[2].height) / 2, hRt = (wheels[1].height + wheels[3].height) / 2;
    S.groundPitch = Math.atan2(hF - hR, C.wheelbase);
    S.groundRoll = Math.atan2(hRt - hL, C.track);
    S.y = hSum / 4;

    // --- wheel loads (static + transfer from last step's filtered accel)
    const Wt = C.mass * G;
    const FzF = (Wt * b) / C.wheelbase / 2, FzR = (Wt * a) / C.wheelbase / 2;
    const dLong = (C.mass * S.axF * C.cgHeight) / C.wheelbase / 2;      // + when accelerating: rear gains
    const dLat = (C.mass * S.ayF * C.cgHeight) / C.track;                // + when accel to the right: right gains? (inertial force left → left wheels load)
    wheels[0].Fz = Math.max(50, FzF - dLong + dLat * 0.55);
    wheels[1].Fz = Math.max(50, FzF - dLong - dLat * 0.55);
    wheels[2].Fz = Math.max(50, FzR + dLong + dLat * 0.45);
    wheels[3].Fz = Math.max(50, FzR + dLong - dLat * 0.45);

    // --- wheel kinematics in wheel frames
    S.vFwd = S.vx * f[0] + S.vz * f[1];
    S.vLat = S.vx * r[0] + S.vz * r[1];
    for (const w of wheels) {
      const vu = S.vFwd + S.yawRate * w.w, vw = S.vLat - S.yawRate * w.u;
      const c = Math.cos(w.steer), s = Math.sin(w.steer);
      w.vwx = vu * c + vw * s; w.vwy = -vu * s + vw * c;
    }

    // --- engine + drivetrain torques
    const T_e = engine.torque(dt, S.throttle);
    const dtOut = drivetrain.step(dt, T_e, driveWheels, S.throttle);
    for (const w of wheels) { w.Tdrive = 0; w.Jextra = 0; }
    for (const w of driveWheels) { w.Tdrive = dtOut.torquePerWheel; w.Jextra = dtOut.extraInertiaPerWheel; }

    // --- brakes + ABS
    S.abs.active = false;
    for (const w of wheels) {
      let Tb = S.brake * (w.front ? C.brakeFront : C.brakeRear);
      if (!w.front) Tb += S.handbrake * C.handbrake;
      if (S.brake > 0.3 && S.speed > 2 && !S.handbrake) {
        if (w.kf < C.absOn) w.absCut = true; else if (w.kf > C.absOff) w.absCut = false;
        if (w.absCut) { Tb *= 0.2; S.abs.active = true; }
      } else w.absCut = false;
      w.Tbrake = Tb;
    }
    if (S.abs.active) S.abs.phase += dt * 12;

    // --- tyres + wheel spin
    for (const w of wheels) tyres.stepWheel(w, dt);
    drivetrain.syncLocked(driveWheels);

    // --- body forces (body frame u fwd, w right)
    let Fu = 0, Fw = 0, Mz = 0;
    for (const w of wheels) {
      const c = Math.cos(w.steer), s = Math.sin(w.steer);
      const fu = w.Fx * c - w.Fy * s, fw = w.Fx * s + w.Fy * c;
      Fu += fu; Fw += fw;
      Mz += -w.u * fw + w.w * fu;
    }
    const v = S.speed;
    if (v > 0.01) {
      const drag = C.dragCoef * v * v, rr = v > 0.05 ? C.rollCoef * Wt : 0;
      const k = -(drag + rr) / v;
      Fu += k * S.vFwd; Fw += k * S.vLat;
    }
    Fu += -C.mass * G * Math.sin(S.groundPitch);
    Fw += -C.mass * G * Math.sin(S.groundRoll);

    S.ax = Fu / C.mass; S.ay = Fw / C.mass;
    S.axF = damp(S.axF, S.ax, 20, dt); S.ayF = damp(S.ayF, S.ay, 20, dt);
    S.vx += (S.ax * f[0] + S.ay * r[0]) * dt;
    S.vz += (S.ax * f[1] + S.ay * r[1]) * dt;
    S.yawRate += (Mz / C.yawInertia) * dt;
    S.yawRate *= 1 - Math.min(0.5, dt * (0.5 + 2 / (1 + v))); // mild yaw damping, stronger at low speed
    // settle: kill sub-cm/s creep when there is no drive or slope demand
    const speedNow = Math.hypot(S.vx, S.vz);
    if (speedNow < 0.03 && Math.abs(S.ax) < 0.5 && Math.abs(S.ay) < 0.5 && (S.brake > 0 || S.handbrake > 0 || drivetrain.S.tcap < 1)) { S.vx = S.vz = 0; S.yawRate = 0; }
    S.x += S.vx * dt; S.z += S.vz * dt; S.yaw += S.yawRate * dt;
    S.sinYaw = Math.sin(S.yaw); S.cosYaw = Math.cos(S.yaw);

    // --- gearbox logic, stall
    if (S.stepCount % 2 === 0) drivetrain.autoLogic(dt * 2, S.throttle, S.vFwd);
    drivetrain.stallCheck(dt);

    // --- visual suspension
    const B = S.body;
    spring2(B.pitch, (S.axF / G) * C.pitchPerG * DEG, C.pitchWn * Math.PI * 2, C.pitchZeta, dt);
    spring2(B.roll, (S.ayF / G) * C.rollPerG * DEG, C.pitchWn * Math.PI * 2, C.pitchZeta, dt);
    spring2(B.heave, S.y, C.heaveWn * Math.PI * 2, C.heaveZeta, dt);
    B.pitchOut = S.groundPitch + B.pitch.x;
    B.rollOut = S.groundRoll + B.roll.x;
    B.heaveOut = B.heave.x - S.y; // sprung-mass lag relative to the ground (m)

    // --- bookkeeping
    S.speed = Math.hypot(S.vx, S.vz);
    S.speedMph = Math.abs(S.vFwd) * MPS_TO_MPH;
    const dMi = S.speed * dt * M_TO_MI; S.odometer += dMi; S.trip += dMi;
    engine.bookkeeping(dt);
    S.fuelWarn = engine.S.fuel < 0.12;
    for (const w of wheels) w.spin += w.omega * dt;
    S.lights.brake = S.brake > 0.05;
    S.lights.reverse = drivetrain.S.gear < 0;
    const L = S.lights;
    if (L.signal || L.hazards) { L.blinkT += dt; L.blinkOn = (L.blinkT % (60 / 85)) < (60 / 85) * 0.5; } else { L.blinkT = 0; L.blinkOn = false; }
  }

  function reset() { teleport(0, 0, 0); engine.S.running = false; engine.S.omega = 0; drivetrain.reset(); S.trip = 0; S.lights.signal = null; S.lights.hazards = false; }

  return { S, C, engine, drivetrain, tyres, wheels, step, teleport, reset, fwd, right, worldOfLocal };
}

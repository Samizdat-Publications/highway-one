// Engine: torque curve, internal friction, idle governor, rev limiter, starter, stall, fuel/temp.
// It never integrates its own speed: drivetrain.js owns omega because the clutch couples it to the wheels.
import { curve, clamp, RAD_TO_RPM } from '../units.js';

export function createEngine(C) {
  const torqueCurve = curve(C.torqueCurve);
  const maxPower = 115000; // W, ~155 hp
  const S = {
    omega: 0, rpm: 0, torque: 0, running: false, starterT: 0, limiterT: 0, stallT: 0,
    load: 0, throttleEff: 0, power: 0, fuel: 0.72, temp: 18, justStarted: false, justStalled: false, cranking: false,
  };
  const friction = (rpm) => C.frictionBase + C.frictionPerRpm * rpm;

  function start() { if (S.running || S.starterT > 0) return; S.starterT = C.starterTime; }
  function stop() { S.running = false; }
  function stall() { if (!S.running) return; S.running = false; S.justStalled = true; }

  // Net crank torque (Nm) at the current omega for this throttle.
  function torque(dt, throttle) {
    S.rpm = S.omega * RAD_TO_RPM;
    S.justStarted = false; S.justStalled = false;
    let T = -friction(S.rpm);
    S.throttleEff = 0;
    S.cranking = S.starterT > 0;
    if (S.starterT > 0) {
      S.starterT -= dt; T += C.starterTorque;
      if (S.rpm > 400 && S.fuel > 0) { S.running = true; S.starterT = 0; S.justStarted = true; }
    }
    if (S.running) {
      if (S.rpm > C.limiterRpm) S.limiterT = C.limiterCut;
      if (S.limiterT > 0) S.limiterT -= dt;
      S.throttleEff = S.limiterT > 0 ? 0 : throttle;
      T += torqueCurve(S.rpm) * S.throttleEff;
      // idle governor / anti-stall (ECU): adds torque as revs sag below idle, regardless of throttle
      T += clamp((C.idleRpm + 50 - S.rpm) * 0.5, 0, 80);
      if (S.fuel <= 0) S.running = false;
    }
    S.torque = T;
    S.power = Math.max(0, T * S.omega);
    S.load = clamp(0.3 * S.throttleEff + 0.7 * (torqueCurve(S.rpm) * S.throttleEff) / 205, 0, 1);
    return T;
  }

  function bookkeeping(dt) {
    if (S.running) {
      S.fuel = Math.max(0, S.fuel - (5.5e-5 + 1.8e-4 * S.power / maxPower) * dt);
      const target = 92 + 10 * S.load;
      S.temp += (target - S.temp) * (dt / 90);
    } else {
      S.temp += (18 - S.temp) * (dt / 600);
    }
  }

  return { S, C, start, stop, stall, torque, bookkeeping, torqueCurve };
}

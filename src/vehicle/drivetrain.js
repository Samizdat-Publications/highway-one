// Clutch + gearbox + final drive. Two-state clutch (locked / slipping), torque-converter-style
// creep in automatic mode, automatic shift logic, manual H-pattern and sequential selection, stalling.
import { clamp, lerp, RAD_TO_RPM, RPM_TO_RAD } from '../units.js';

export function createDrivetrain(C, engine) {
  const ratios = C.gears;
  const S = {
    mode: 'auto',            // 'auto' | 'manualH' | 'manualSeq'
    gear: 0,                 // -1 R, 0 N, 1..5
    sel: 'P',                // auto selector P R N D
    clutchPos: 0,            // 0 engaged … 1 pedal fully down
    clutchState: 'slipping', // 'locked' | 'slipping'
    tcap: 0, tc: 0, slipRpm: 0,
    shiftT: 0, shiftPhase: 'none', targetGear: 0, lastShiftT: 9, shiftDir: 0,
    autoClutchT: 0,          // sequential mode auto-declutch timer
    crunch: false, justShifted: false,
    stallT: 0,
    G: 0,
  };
  const E = engine.S;
  const Je = C.engineInertia;

  const ratio = (g) => (g === 0 ? 0 : g < 0 ? -C.reverse * C.finalDrive : ratios[g - 1] * C.finalDrive);

  // ---- selection ------------------------------------------------------------
  function setMode(m) {
    S.mode = m;
    if (m === 'auto') { S.sel = S.gear > 0 ? 'D' : S.gear < 0 ? 'R' : 'N'; if (S.gear === 0) S.sel = 'N'; }
  }
  function engage(g, viaClutch) {
    if (g === S.gear) return;
    S.justShifted = true; S.shiftDir = g > S.gear ? 1 : -1;
    if (S.mode === 'manualH' && !viaClutch && S.clutchPos < 0.5 && S.gear !== 0 && g !== 0) {
      // clutchless H-pattern shift: allowed, but crunchy if the shafts are far apart
      S.crunch = Math.abs(S.slipRpm) > 1400;
    }
    S.gear = g; S.G = ratio(g); S.lastShiftT = 0;
  }
  function requestSequential(dir, speedMps) {
    if (S.mode === 'auto') {
      const order = ['P', 'R', 'N', 'D'];
      let i = order.indexOf(S.sel) + dir; i = clamp(i, 0, 3);
      const next = order[i];
      if (next === 'P' && Math.abs(speedMps) > 1.5) return;      // parking pawl refuses
      if ((next === 'R' && speedMps > 1.5) || (next === 'D' && speedMps < -1.5)) return;
      S.sel = next;
      if (next === 'D') engage(Math.max(1, S.gear > 0 ? S.gear : 1), true);
      else if (next === 'R') engage(-1, true);
      else engage(0, true);
      return;
    }
    let g = S.gear + dir;
    g = clamp(g, -1, ratios.length);
    if (S.mode === 'manualSeq') { S.autoClutchT = 0.15; engage(g, true); }
    else engage(g, false);
  }
  function requestGear(g) { // H-pattern direct select
    if (S.mode !== 'manualH') return;
    engage(g, false);
  }

  // ---- per-step coupling ------------------------------------------------------
  // driveWheels: array of wheel objects with .omega, .J. Returns torque applied to each drive wheel and
  // the effective extra inertia they carry while locked. Integrates engine omega.
  function step(dt, T_e, driveWheels, throttle) {
    S.crunch = false; S.justShifted = false;
    S.lastShiftT += dt;
    if (S.autoClutchT > 0) S.autoClutchT -= dt;
    const clutchPedal = S.mode === 'manualSeq' ? Math.max(S.clutchPos, S.autoClutchT > 0 ? 1 : 0) : S.clutchPos;

    // automatic: torque-converter creep and shift torque ramps
    let capScale = 1;
    if (S.mode === 'auto') {
      capScale = clamp((E.rpm - 700) / 1500, 0, 1);
      if (S.shiftPhase === 'cut') { S.shiftT += dt; capScale *= clamp(1 - S.shiftT / C.shiftCutTime, 0, 1); if (S.shiftT >= C.shiftCutTime) { engage(S.targetGear, true); S.shiftPhase = 'blend'; S.shiftT = 0; } }
      else if (S.shiftPhase === 'blend') { S.shiftT += dt; capScale *= clamp(S.shiftT / C.shiftBlendTime, 0, 1); if (S.shiftT >= C.shiftBlendTime) S.shiftPhase = 'none'; }
      if (S.sel === 'P' || S.sel === 'N') capScale = 0;
    } else {
      // bite point: the top third of pedal travel transmits nothing, then capacity grows smoothly
      const e = clamp((1 - clutchPedal - 0.3) / 0.6, 0, 1);
      capScale = e * e * (3 - 2 * e);
    }
    S.tcap = C.clutchCap * capScale;
    const G = S.G;
    const nW = driveWheels.length;

    if (G === 0 || S.tcap <= 0.5) {
      // engine free
      E.omega = Math.max(0, E.omega + (T_e / Je) * dt);
      S.tc = 0; S.clutchState = 'slipping';
      S.slipRpm = E.rpm - (G === 0 ? 0 : meanOmega(driveWheels) * G * RAD_TO_RPM);
      return { torquePerWheel: 0, extraInertiaPerWheel: 0, locked: false };
    }

    const wIn = meanOmega(driveWheels) * G;
    const dW = E.omega - wIn;
    S.slipRpm = dW * RAD_TO_RPM;

    if (S.clutchState === 'locked') {
      // predicted transmitted torque if the shafts stay locked: engine torque minus what the engine inertia absorbs.
      // Wheels integrate with the engine's reflected inertia; drivetrain reads back omega afterwards.
      if (Math.abs(dW) > 25) S.clutchState = 'slipping';
      else {
        const Ttrans = T_e; // approximation: locked → the engine's net torque reaches the input shaft
        if (Math.abs(Ttrans) > S.tcap) S.clutchState = 'slipping';
        else return { torquePerWheel: (T_e * G * C.efficiency) / nW, extraInertiaPerWheel: (Je * G * G) / nW, locked: true, G };
      }
    }
    // slipping
    let tc = S.tcap * clamp(dW / 3, -1, 1);
    S.tc = tc;
    E.omega = Math.max(0, E.omega + ((T_e - tc) / Je) * dt);
    if (Math.abs(dW) < 2 && Math.abs(T_e) < S.tcap) S.clutchState = 'locked';
    return { torquePerWheel: (tc * G * C.efficiency) / nW, extraInertiaPerWheel: 0, locked: false, G };
  }

  // called after wheel integration when locked: engine follows the wheels
  function syncLocked(driveWheels) {
    if (S.clutchState === 'locked' && S.G !== 0) E.omega = Math.max(0, meanOmega(driveWheels) * S.G);
  }

  // automatic shift decisions (call at 60 Hz)
  function autoLogic(dt, throttle, speedMps) {
    if (S.mode !== 'auto' || S.sel !== 'D' || S.shiftPhase !== 'none') return;
    if (S.lastShiftT < C.autoShiftMinGap) return;
    const rpm = E.rpm, g = S.gear;
    const up = lerp(2300, 6100, Math.pow(throttle, 1.5));
    const down = lerp(1100, 3900, throttle);
    const predicted = (ng) => rpm * ratios[ng - 1] / ratios[g - 1];
    if (g < ratios.length && rpm > up && predicted(g + 1) > 1400) { S.targetGear = g + 1; S.shiftPhase = 'cut'; S.shiftT = 0; return; }
    if (g > 1 && (rpm < down || (throttle > 0.9 && predicted(g - 1) < 6000 && rpm < 4200))) { S.targetGear = g - 1; S.shiftPhase = 'cut'; S.shiftT = 0; }
  }

  function stallCheck(dt) {
    if (!E.running || S.mode === 'auto') { S.stallT = 0; return; }
    const coupled = S.G !== 0 && S.tcap > 100;
    if (coupled && E.rpm < C.stallRpm) { S.stallT += dt; if (S.stallT > 0.25) { engine.stall(); S.stallT = 0; } }
    else S.stallT = 0;
  }

  function gearLabel() {
    if (S.mode === 'auto') return S.sel;
    return S.gear === 0 ? 'N' : S.gear < 0 ? 'R' : String(S.gear);
  }

  function reset() { S.gear = 0; S.G = 0; S.sel = 'P'; S.clutchState = 'slipping'; S.shiftPhase = 'none'; S.clutchPos = 0; S.stallT = 0; }

  return { S, setMode, requestSequential, requestGear, step, syncLocked, autoLogic, stallCheck, gearLabel, reset, ratio };
}

function meanOmega(ws) { let s = 0; for (const w of ws) s += w.omega; return s / ws.length; }

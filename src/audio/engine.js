// Engine synth: harmonic exhaust through a soft clipper + lowpass, sub, intake noise, mechanical whine,
// starter cranks, stall, limiter stutter, shift clunk and crunch. Driven from the engine/drivetrain state.
import { clamp, lerp } from '../units.js';

export function createEngineAudio(audio, car) {
  const { A, param } = audio;
  let n = null; // node graph
  function build() {
    const ctx = A.ctx;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(A.buses.engine);
    // exhaust: custom periodic wave, odd harmonics emphasised
    const real = new Float32Array(25), imag = new Float32Array(25);
    for (let k = 1; k < 25; k++) { imag[k] = (1 / Math.pow(k, 1.15)) * (k % 2 ? 1.4 : 1); }
    const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    const ex = ctx.createOscillator(); ex.setPeriodicWave(wave); ex.frequency.value = 27;
    const exGain = ctx.createGain(); exGain.gain.value = 0.5;
    const shaper = ctx.createWaveShaper(); shaper.curve = makeClip(2.5); shaper.oversample = '2x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.8;
    ex.connect(exGain); exGain.connect(shaper); shaper.connect(lp); lp.connect(out);
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 13.5; const subGain = ctx.createGain(); subGain.gain.value = 0.3; sub.connect(subGain); subGain.connect(out);
    const intake = audio.noiseSource('white'); const inBp = ctx.createBiquadFilter(); inBp.type = 'bandpass'; inBp.frequency.value = 600; inBp.Q.value = 1.8; const inGain = ctx.createGain(); inGain.gain.value = 0; intake.connect(inBp); inBp.connect(inGain); inGain.connect(out);
    const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 320; const whGain = ctx.createGain(); whGain.gain.value = 0.02; whine.connect(whGain); whGain.connect(out);
    // idle roughness: AM on the exhaust gain
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 13; const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.06; lfo.connect(lfoGain); lfoGain.connect(exGain.gain);
    // starter / clunk / crunch one-shots use their own nodes
    ex.start(); sub.start(); intake.start(); whine.start(); lfo.start();
    n = { out, ex, exGain, shaper, lp, sub, subGain, inBp, inGain, whine, whGain, lfo, lfoGain, gate: 0 };
  }
  function makeClip(drive) { const N = 1024, c = new Float32Array(N); for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); } return c; }

  let lastRunning = false, lastCrank = false, lastGear = 0, limiterPhase = 0, wasLimiting = false, smoothRpm = 0;
  function oneShot(fn) { if (!A.ctx) return; fn(A.ctx, A.buses.engine); }
  function clunk(strength = 1) { oneShot((ctx, bus) => { const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.08); const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * strength, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.14); }); }
  function crunch() { oneShot((ctx, bus) => { const t = ctx.currentTime; const s = audio.noiseSource('white', false); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2; const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); s.connect(bp); bp.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.4); }); }
  function crank() { oneShot((ctx, bus) => { const t0 = ctx.currentTime; for (let i = 0; i < 4; i++) { const t = t0 + i * 0.22; const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.1); const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2); const s = audio.noiseSource('white', false); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.15, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12); s.connect(bp); bp.connect(ng); ng.connect(bus); s.start(t); s.stop(t + 0.15); } }); }

  function update(dt) {
    if (!A.ready) return;
    if (!n) build();
    const E = car.S.engine, D = car.S.drive;
    smoothRpm = lerp(smoothRpm, E.rpm, 1 - Math.exp(-dt / 0.03));
    const rpm = Math.max(0, smoothRpm);
    const running = E.running || E.cranking;
    if (E.cranking && !lastCrank) crank();
    lastCrank = E.cranking;
    if (D.justShifted) clunk(D.mode === 'auto' ? 0.35 : 0.8);
    if (D.crunch) crunch();
    if (E.justStalled) clunk(1.2);
    const f0 = rpm / 30; // 4-cylinder firing frequency
    const load = clamp(0.3 * E.throttleEff + 0.7 * clamp(E.torque / 205, 0, 1), 0, 1);
    const overrun = E.throttleEff < 0.05 && rpm > 2000 ? 1 : 0;
    param(n.ex.frequency, Math.max(4, f0), 0.02);
    param(n.sub.frequency, Math.max(2, f0 / 2), 0.02);
    param(n.lp.frequency, clamp(350 + 1500 * load + 0.12 * rpm - overrun * 200, 200, 6000), 0.05);
    param(n.inBp.frequency, clamp(450 + 0.35 * rpm, 300, 4000), 0.05);
    param(n.inGain.gain, running ? 0.45 * E.throttleEff * 0.5 : 0, 0.05);
    param(n.whine.frequency, Math.max(20, (rpm / 60) * 24), 0.03);
    param(n.exGain.gain, running ? lerp(0.35, 1.0, load) : 0, 0.05);
    param(n.subGain.gain, running ? lerp(0.25, 0.5, load) : 0, 0.05);
    param(n.lfoGain.gain, running ? 0.06 * clamp(1 - rpm / 2000, 0, 1) : 0, 0.1);
    param(n.lfo.frequency, Math.max(2, f0), 0.05);
    // rev limiter stutter: gate the output at 15 Hz while cutting
    let gate = 1;
    if (E.limiterT > 0) { limiterPhase += dt * 15; gate = Math.sin(limiterPhase * Math.PI * 2) > 0 ? 1 : 0.15; wasLimiting = true; } else if (wasLimiting) { wasLimiting = false; }
    const vol = running ? (0.18 + 0.55 * load + overrun * 0.12) * gate : 0;
    param(n.out.gain, vol, 0.03);
    lastRunning = running;
  }
  return { update, clunk, crunch };
}

// Cabin and chassis sounds: road/wind noise, tyre squeal, indicator relay, wipers, horn, chimes,
// collisions, ABS pulse, rain on the roof, tunnel reverb send.
import { clamp, lerp } from '../units.js';

export function createSfx(audio, car) {
  const { A, param } = audio;
  let n = null;
  function build() {
    const ctx = A.ctx, bus = A.buses.sfx;
    // continuous beds
    const road = audio.noiseSource('pink'); const roadLp = ctx.createBiquadFilter(); roadLp.type = 'lowpass'; roadLp.frequency.value = 200; const roadG = ctx.createGain(); roadG.gain.value = 0; road.connect(roadLp); roadLp.connect(roadG); roadG.connect(bus); road.start();
    const rumble = ctx.createOscillator(); rumble.type = 'sine'; rumble.frequency.value = 9; const rumbleG = ctx.createGain(); rumbleG.gain.value = 0; rumble.connect(rumbleG); rumbleG.connect(roadG.gain); rumble.start();
    const wind = audio.noiseSource('white'); const windBp = ctx.createBiquadFilter(); windBp.type = 'bandpass'; windBp.frequency.value = 900; windBp.Q.value = 0.5; const windG = ctx.createGain(); windG.gain.value = 0; wind.connect(windBp); windBp.connect(windG); windG.connect(bus); wind.start();
    const sq = ctx.createOscillator(); sq.type = 'sawtooth'; sq.frequency.value = 1200; const sqV = ctx.createOscillator(); sqV.frequency.value = 6; const sqVG = ctx.createGain(); sqVG.gain.value = 40; sqV.connect(sqVG); sqVG.connect(sq.frequency); const sqBp = ctx.createBiquadFilter(); sqBp.type = 'bandpass'; sqBp.frequency.value = 1300; sqBp.Q.value = 3; const sqG = ctx.createGain(); sqG.gain.value = 0; sq.connect(sqBp); sqBp.connect(sqG); sqG.connect(bus); sq.start(); sqV.start();
    const rain = audio.noiseSource('white'); const rainLp = ctx.createBiquadFilter(); rainLp.type = 'lowpass'; rainLp.frequency.value = 2600; const rainG = ctx.createGain(); rainG.gain.value = 0; rain.connect(rainLp); rainLp.connect(rainG); rainG.connect(bus); rain.start();
    const horn1 = ctx.createOscillator(); horn1.type = 'sawtooth'; horn1.frequency.value = 440; const horn2 = ctx.createOscillator(); horn2.type = 'sawtooth'; horn2.frequency.value = 525; const hornBp = ctx.createBiquadFilter(); hornBp.type = 'bandpass'; hornBp.frequency.value = 700; hornBp.Q.value = 1; const hornG = ctx.createGain(); hornG.gain.value = 0; horn1.connect(hornBp); horn2.connect(hornBp); hornBp.connect(hornG); hornG.connect(bus); horn1.start(); horn2.start();
    const wiper = audio.noiseSource('white'); const wipBp = ctx.createBiquadFilter(); wipBp.type = 'bandpass'; wipBp.frequency.value = 500; wipBp.Q.value = 2; const wipG = ctx.createGain(); wipG.gain.value = 0; wiper.connect(wipBp); wipBp.connect(wipG); wipG.connect(bus); wiper.start();
    const abs = ctx.createOscillator(); abs.type = 'square'; abs.frequency.value = 12; const absG = ctx.createGain(); absG.gain.value = 0; const absLp = ctx.createBiquadFilter(); absLp.type = 'lowpass'; absLp.frequency.value = 120; abs.connect(absLp); absLp.connect(absG); absG.connect(bus); abs.start();
    // tunnel reverb send
    const conv = ctx.createConvolver(); conv.buffer = audio.impulse(1.6, 3); const revG = ctx.createGain(); revG.gain.value = 0; A.buses.engine.connect(revG); bus.connect(revG); revG.connect(conv); conv.connect(A.master);
    n = { roadLp, roadG, rumbleG, windBp, windG, sq, sqG, rainG, hornG, wipBp, wipG, absG, revG };
  }
  function blip(freq, dur, gain, type = 'square') { if (!A.ctx) return; const ctx = A.ctx, t = ctx.currentTime; const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(A.buses.sfx); o.start(t); o.stop(t + dur + 0.01); }
  function chime() { blip(880, 0.25, 0.12, 'sine'); setTimeout(() => blip(1174, 0.3, 0.1, 'sine'), 180); }
  function crash(speed) { if (!A.ctx) return; const ctx = A.ctx, t = ctx.currentTime; const s = audio.noiseSource('white', false); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; const g = ctx.createGain(); const amp = clamp(speed / 8, 0.1, 1); g.gain.setValueAtTime(0.9 * amp, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4 + amp * 0.4); s.connect(lp); lp.connect(g); g.connect(A.buses.sfx); s.start(t); s.stop(t + 1); const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.3); const og = ctx.createGain(); og.gain.setValueAtTime(0.8 * amp, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(og); og.connect(A.buses.sfx); o.start(t); o.stop(t + 0.4); }
  let lastBlink = false, lastCollision = null, lastWiperPhase = 0, lastWiperDir = 0, beltT = 0;
  function update(dt, weather, inTunnel) {
    if (!A.ready) return;
    if (!n) build();
    const S = car.S, v = S.speed;
    const surf = S.wheels[0].surface;
    const rough = surf === 'sand' || surf === 'dirt' || surf === 'grass';
    param(n.roadLp.frequency, rough ? 140 : 180 + 18 * v, 0.1);
    param(n.roadG.gain, clamp(Math.pow(v / 30, 1.2), 0, 1.4) * (rough ? 0.5 : 0.22), 0.1);
    param(n.rumbleG.gain, rough && v > 1 ? 0.15 : 0, 0.1);
    param(n.windG.gain, clamp(Math.pow(v / 45, 2), 0, 1) * 0.25, 0.1);
    // squeal from slip
    let sl = 0; for (const w of S.wheels) sl = Math.max(sl, Math.max(0, Math.abs(w.alpha) * 57.3 - 6) / 8, Math.max(0, Math.abs(w.kappa) - 0.2) / 0.3);
    const squeal = v > 3 && surf === 'asphalt' ? clamp(sl, 0, 1) : 0;
    param(n.sqG.gain, squeal * 0.25 * (1 - S.wetness * 0.6), 0.05);
    param(n.sq.frequency, 1000 + 400 * squeal + v * 4, 0.05);
    // indicator relay
    const L = S.lights; const blinkOn = (L.signal || L.hazards) && L.blinkOn;
    if (blinkOn !== lastBlink) { blip(blinkOn ? 1300 : 950, 0.03, 0.18); lastBlink = blinkOn; }
    // wipers: swish while moving, thunk at reversal
    const wp = S.wipers.phase; const moving = S.wipers.moving; const dir = Math.sign(Math.sin(wp * Math.PI * 2 + 1e-3));
    param(n.wipG.gain, moving ? 0.12 : 0, 0.05); param(n.wipBp.frequency, moving ? 300 + 600 * Math.abs(Math.sin(wp * Math.PI * 2)) : 300, 0.03);
    if (moving && dir !== lastWiperDir && lastWiperDir !== 0) blip(45, 0.06, 0.25, 'sine');
    lastWiperDir = moving ? dir : 0;
    // horn
    param(n.hornG.gain, S.hornOn ? 0.5 : 0, 0.015);
    // ABS
    param(n.absG.gain, S.abs.active ? 0.12 : 0, 0.03);
    // rain on the roof
    param(n.rainG.gain, (weather ? weather.S.rain : 0) * 0.16 * (inTunnel ? 0 : 1), 0.3);
    // reverb send in tunnels
    param(n.revG.gain, inTunnel ? 0.35 : 0, 0.5);
    // collisions
    if (S.lastCollision && S.lastCollision !== lastCollision) { lastCollision = S.lastCollision; crash(S.lastCollision.speed); }
    // seatbelt chime while moving unbelted
    if (!S.seatbelt && v > 2 && S.engine.running) { beltT += dt; if (beltT > 1.4) { beltT = 0; blip(880, 0.18, 0.08, 'sine'); } } else beltT = 0;
  }
  return { update, blip, chime, crash };
}

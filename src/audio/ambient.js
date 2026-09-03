// Outside-the-cabin ambience heard through the glass: ocean bed by distance to shore, seagulls, pier hum,
// town hum. Everything is lowpassed as if the windows are up.
import { clamp, lerp } from '../units.js';

export function createAmbient(audio, car, terrain) {
  const { A, param } = audio;
  let n = null, gullT = 4, chaseT = 0;
  function build() {
    const ctx = A.ctx;
    const cabin = ctx.createBiquadFilter(); cabin.type = 'lowpass'; cabin.frequency.value = 2200; cabin.connect(A.buses.ambient);
    const ocean = audio.noiseSource('brown'); const oLp = ctx.createBiquadFilter(); oLp.type = 'lowpass'; oLp.frequency.value = 600; const oG = ctx.createGain(); oG.gain.value = 0; ocean.connect(oLp); oLp.connect(oG); oG.connect(cabin); ocean.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lfoG = ctx.createGain(); lfoG.gain.value = 0.35; lfo.connect(lfoG); lfoG.connect(oG.gain); lfo.start();
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 50; const humG = ctx.createGain(); humG.gain.value = 0; hum.connect(humG); humG.connect(cabin); hum.start();
    const town = audio.noiseSource('pink'); const tBp = ctx.createBiquadFilter(); tBp.type = 'bandpass'; tBp.frequency.value = 400; tBp.Q.value = 0.7; const tG = ctx.createGain(); tG.gain.value = 0; town.connect(tBp); tBp.connect(tG); tG.connect(cabin); town.start();
    n = { cabin, oG, humG, tG };
  }
  function gull() { if (!A.ctx) return; const ctx = A.ctx, t0 = ctx.currentTime; const notes = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < notes; i++) { const t = t0 + i * 0.28; const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(600 + Math.random() * 150, t); o.frequency.linearRampToValueAtTime(950 + Math.random() * 200, t + 0.12); o.frequency.linearRampToValueAtTime(650, t + 0.25); const m = ctx.createOscillator(); m.frequency.value = 38; const mg = ctx.createGain(); mg.gain.value = 60; m.connect(mg); mg.connect(o.frequency); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26); const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1; o.connect(g); g.connect(pan); pan.connect(n.cabin); o.start(t); m.start(t); o.stop(t + 0.3); m.stop(t + 0.3); } }
  function update(dt, here) {
    if (!A.ready) return;
    if (!n) build();
    const S = car.S;
    const shoreX = S.z > -260 ? -110 : terrain.coastAt(S.z).x - 60;
    const dShore = Math.max(0, S.x - shoreX);
    const oceanGain = 0.5 / (1 + dShore / 70) * (S.inTunnel ? 0.05 : 1);
    param(n.oG.gain, oceanGain, 0.5);
    const nearPier = Math.hypot(S.x + 80, S.z - 115) < 90;
    param(n.humG.gain, nearPier ? 0.05 : 0, 0.5);
    const inTown = S.z > -260 && S.z < 260 && S.x > -60 && S.x < 440;
    param(n.tG.gain, inTown ? 0.05 : 0, 1);
    gullT -= dt; if (gullT <= 0) { gullT = 8 + Math.random() * 14; if (dShore < 200 && !S.inTunnel) gull(); }
  }
  return { update };
}

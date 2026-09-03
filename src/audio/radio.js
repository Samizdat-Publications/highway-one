// Procedural radio: three stations (surf-pop sequencer, late-night jazz, AM talk murmur) and static
// between them, through a small-speaker EQ. Reads the display state from cockpit/radio.js.
import { clamp } from '../units.js';

const KEYS = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88];
export function createRadioAudio(audio, radioDisplay) {
  const { A, param } = audio;
  let n = null, cur = null, sched = { surf: 0, jazz: 0, talk: 0 }, staticT = 0, lastIndex = -1, lastOn = false, duckT = 0, duckLevel = 0.35;
  function build() {
    const ctx = A.ctx;
    const speaker = ctx.createBiquadFilter(); speaker.type = 'bandpass'; speaker.frequency.value = 900; speaker.Q.value = 0.35;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 6;
    const vol = ctx.createGain(); vol.gain.value = 0;
    speaker.connect(comp); comp.connect(vol); vol.connect(A.buses.radio);
    const stat = audio.noiseSource('white'); const sG = ctx.createGain(); sG.gain.value = 0; stat.connect(sG); sG.connect(speaker); stat.start();
    const music = ctx.createGain(); music.gain.value = 1; music.connect(speaker);
    // talk: formant murmur
    const talk = audio.noiseSource('pink'); const tG = ctx.createGain(); tG.gain.value = 0; const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), f3 = ctx.createBiquadFilter();
    for (const [f, fr, q] of [[f1, 500, 8], [f2, 1500, 10], [f3, 2500, 12]]) { f.type = 'bandpass'; f.frequency.value = fr; f.Q.value = q; talk.connect(f); f.connect(tG); }
    const am = ctx.createBiquadFilter(); am.type = 'bandpass'; am.frequency.value = 1200; am.Q.value = 0.6; tG.connect(am); am.connect(speaker); talk.start();
    n = { speaker, vol, sG, music, tG, f1, f2, f3, talkEnv: 0 };
  }
  // ---- surf pop: 100 bpm, I–V–vi–IV, 8-bar phrases
  const surf = { bpm: 100, root: 0, bar: 0 };
  function noteHz(deg, oct = 0) { const base = KEYS[(deg + surf.root) % 7]; return base * Math.pow(2, oct + Math.floor((deg + surf.root) / 7)); }
  function scheduleSurf(until) {
    const ctx = A.ctx; const beat = 60 / surf.bpm;
    while (sched.surf < until) {
      const t = sched.surf; const step = Math.round(t / (beat / 2)) % 16; const bar = Math.floor(t / (beat * 4)) % 4;
      const chord = [0, 4, 5, 3][bar];
      if (step % 4 === 0) kick(t); if (step % 4 === 2) snare(t); if (step % 2 === 1) hat(t, 0.05); else hat(t, 0.03);
      if (step % 4 === 0 || step === 6 || step === 14) bass(t, noteHz(chord, -2), beat * 0.9);
      if (step === 0) pad(t, [noteHz(chord, 0), noteHz(chord + 2, 0), noteHz(chord + 4, 0)], beat * 4);
      if (step % 2 === 0) arp(t, noteHz(chord + [0, 2, 4, 2][(step / 2) % 4], 1), beat * 0.4);
      sched.surf += beat / 2;
    }
  }
  function kick(t) { const ctx = A.ctx; const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(n.music); o.start(t); o.stop(t + 0.3); }
  function snare(t) { const ctx = A.ctx; const s = audio.noiseSource('white', false); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); s.connect(bp); bp.connect(g); g.connect(n.music); s.start(t); s.stop(t + 0.2); }
  function hat(t, amp) { const ctx = A.ctx; const s = audio.noiseSource('white', false); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; const g = ctx.createGain(); g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(hp); hp.connect(g); g.connect(n.music); s.start(t); s.stop(t + 0.06); }
  function bass(t, hz, dur) { const ctx = A.ctx; const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz; const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(n.music); o.start(t); o.stop(t + dur + 0.02); }
  function pad(t, hzs, dur) { const ctx = A.ctx; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(1600, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(500, t + dur); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3); g.gain.setValueAtTime(0.05, t + dur - 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur); lp.connect(g); g.connect(n.music); for (const hz of hzs) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); } }
  function arp(t, hz, dur) { const ctx = A.ctx; const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz; const g = ctx.createGain(); g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(n.music); o.start(t); o.stop(t + dur + 0.02); }
  // ---- jazz: swing, walking bass, rhodes 7th chords, brushed snare
  const jazz = { bpm: 92, root: 3 };
  function jz(deg, oct = 0) { const base = KEYS[(deg + jazz.root) % 7]; return base * Math.pow(2, oct + Math.floor((deg + jazz.root) / 7)); }
  function scheduleJazz(until) {
    const beat = 60 / jazz.bpm;
    while (sched.jazz < until) {
      const t = sched.jazz; const b = Math.round(t / beat); const bar = Math.floor(b / 4) % 4; const chord = [1, 4, 0, 5][bar];
      const walk = [0, 2, 4, 5][b % 4];
      bass(t, jz(chord + walk, -2), beat * 0.8);
      hat(t, 0.02); hat(t + beat * 0.66, 0.035);
      if (b % 2 === 1) snareBrush(t);
      if (b % 4 === 0 || b % 4 === 2) rhodes(t + (b % 4 === 2 ? beat * 0.66 : 0), [jz(chord, 0), jz(chord + 2, 0), jz(chord + 4, 0), jz(chord + 6, 0)], beat * 1.8);
      sched.jazz += beat;
    }
  }
  function snareBrush(t) { const ctx = A.ctx; const s = audio.noiseSource('pink', false); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.8; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); s.connect(bp); bp.connect(g); g.connect(n.music); s.start(t); s.stop(t + 0.35); }
  function rhodes(t, hzs, dur) { const ctx = A.ctx; for (const hz of hzs) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz; const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 4; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur); const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.012, t); g2.gain.exponentialRampToValueAtTime(0.0005, t + dur * 0.3); o.connect(g); o2.connect(g2); g.connect(n.music); g2.connect(n.music); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); } }
  // ---- talk
  function updateTalk(dt) {
    n.talkEnv += dt;
    const syll = Math.max(0, Math.sin(n.talkEnv * 2 * Math.PI * 4.2)) * (0.6 + 0.4 * Math.sin(n.talkEnv * 0.7)) * (Math.sin(n.talkEnv * 0.31) > -0.6 ? 1 : 0);
    param(n.tG.gain, syll * 0.35, 0.02);
    param(n.f1.frequency, 400 + 250 * Math.sin(n.talkEnv * 3.1), 0.05); param(n.f2.frequency, 1300 + 500 * Math.sin(n.talkEnv * 2.3 + 1), 0.05); param(n.f3.frequency, 2400 + 400 * Math.sin(n.talkEnv * 1.7 + 2), 0.05);
  }
  function update(dt) {
    if (!A.ready) return;
    if (!n) build();
    const R = radioDisplay.S;
    const on = R.on && (radioDisplay.ignition ? radioDisplay.ignition() : true);
    if (R.index !== lastIndex || on !== lastOn) { staticT = on ? 0.6 : 0; lastIndex = R.index; lastOn = on; const now = audio.now(); sched.surf = now + 0.1; sched.jazz = now + 0.1; }
    if (staticT > 0) staticT -= dt;
    const st = on ? (staticT > 0 ? clamp(staticT / 0.6, 0, 1) : 0) : 0;
    param(n.sG.gain, st * 0.25, 0.05);
    duckT = Math.max(0, duckT - dt);
    param(n.vol.gain, on ? R.volume * (duckT > 0 ? duckLevel : 1) : 0, 0.15);
    const station = on ? radioDisplay.S.station : null;
    const id = station ? station.id : null;
    const until = audio.now() + 0.6;
    if (id === 'surf' && st < 0.5) scheduleSurf(until); else sched.surf = Math.max(sched.surf, until);
    if (id === 'jazz' && st < 0.5) scheduleJazz(until); else sched.jazz = Math.max(sched.jazz, until);
    if (id === 'talk' && st < 0.5) updateTalk(dt); else param(n.tG.gain, 0, 0.05);
  }
  function duck(seconds, level = 0.35) { duckT = seconds; duckLevel = level; }
  return { update, duck };
}

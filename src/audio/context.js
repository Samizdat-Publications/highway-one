// Web Audio context, buses, shared noise buffers and parameter helpers. Everything is synthesized.
export function createAudioContext() {
  const A = { ctx: null, master: null, buses: {}, noise: {}, ready: false, volume: 0.8 };
  function init() {
    if (A.ready) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return false;
    const ctx = new Ctx({ latencyHint: 'interactive' }); A.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    A.master = ctx.createGain(); A.master.gain.value = A.volume;
    A.master.connect(comp); comp.connect(ctx.destination);
    for (const b of ['engine', 'sfx', 'ambient', 'radio']) { const g = ctx.createGain(); g.gain.value = 1; g.connect(A.master); A.buses[b] = g; }
    // noise buffers (2 s)
    const len = ctx.sampleRate * 2;
    const mk = (fill) => { const buf = ctx.createBuffer(1, len, ctx.sampleRate); fill(buf.getChannelData(0)); return buf; };
    A.noise.white = mk((d) => { for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; });
    A.noise.pink = mk((d) => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } });
    A.noise.brown = mk((d) => { let l = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } });
    A.ready = true;
    return true;
  }
  function noiseSource(kind, loop = true) { const s = A.ctx.createBufferSource(); s.buffer = A.noise[kind]; s.loop = loop; return s; }
  function param(p, v, tau = 0.03) { if (!A.ctx) return; p.setTargetAtTime(v, A.ctx.currentTime, tau); }
  function setVolume(v) { A.volume = v; if (A.master) param(A.master.gain, v, 0.05); }
  function suspend() { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); }
  function resume() { if (A.ctx && A.ctx.state !== 'running') A.ctx.resume(); }
  const now = () => (A.ctx ? A.ctx.currentTime : 0);
  // synthesized impulse response for reverb (tunnel)
  function impulse(seconds, decay) { const ctx = A.ctx; const len = Math.floor(ctx.sampleRate * seconds); const buf = ctx.createBuffer(2, len, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return buf; }
  return { A, init, noiseSource, param, setVolume, suspend, resume, now, impulse };
}

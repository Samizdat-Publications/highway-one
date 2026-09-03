// Baked voice clips (assets/audio/voice/*.mp3 from tools/gen_voice.py): radio DJ breaks between songs,
// KPCH traffic/weather, nav turn prompts, dispatcher. Everything degrades silently when a clip is missing.
export function createVoice(audio, radioDisplay, radioAudio) {
  const { A, param } = audio;
  const clips = new Map();
  let pending = new Map();
  const NAMES = ['surf_1', 'surf_2', 'surf_3', 'surf_4', 'surf_5', 'jazz_1', 'jazz_2', 'jazz_3', 'kpch_1', 'kpch_2', 'kpch_3', 'kpch_4', 'nav_left', 'nav_right', 'nav_left_300', 'nav_right_300', 'nav_straight', 'nav_uturn', 'nav_arrived', 'nav_start', 'nav_recalc', 'dispatch_new', 'dispatch_done'];
  const S = { enabled: true, navVoice: true, speaking: 0, djT: 25, lastDj: -1 };

  async function load(name) {
    if (clips.has(name) || pending.has(name) || !A.ctx) return;
    const p = fetch(`./assets/audio/voice/${name}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((buf) => A.ctx.decodeAudioData(buf)).then((b) => { clips.set(name, b); }).catch(() => { clips.set(name, null); });
    pending.set(name, p);
  }
  function preload() { for (const n of NAMES) load(n); }
  // play a clip on a bus; returns its duration (0 if missing)
  function play(name, bus, gain = 1, onEnd) {
    const b = clips.get(name); if (!b || !A.ctx) return 0;
    const src = A.ctx.createBufferSource(); src.buffer = b;
    const g = A.ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(bus); src.start();
    S.speaking = Math.max(S.speaking, b.duration);
    if (onEnd) src.onended = onEnd;
    return b.duration;
  }
  const navQueue = [];
  let navBusy = 0;
  function nav(name) { if (!S.navVoice) return; if (!navQueue.includes(name)) navQueue.push(name); }
  function dispatch(name) { play(name, A.buses.sfx, 0.9); }

  function update(dt) {
    if (!A.ready) return;
    if (!clips.size && !pending.size) preload();
    S.speaking = Math.max(0, S.speaking - dt);
    // nav prompts, one at a time, ducking the radio
    navBusy = Math.max(0, navBusy - dt);
    if (navQueue.length && navBusy <= 0) { const n = navQueue.shift(); const d = play(n, A.buses.sfx, 1.0); navBusy = d + 0.4; if (d > 0) radioAudio.duck(d + 0.3); }
    // DJ breaks between songs when the radio is on
    const R = radioDisplay.S;
    if (R.on && R.station) {
      S.djT -= dt;
      if (S.djT <= 0) {
        const pool = R.station.id === 'surf' ? ['surf_1', 'surf_2', 'surf_3', 'surf_4', 'surf_5'] : R.station.id === 'jazz' ? ['jazz_1', 'jazz_2', 'jazz_3'] : ['kpch_1', 'kpch_2', 'kpch_3', 'kpch_4'];
        let i = Math.floor(Math.random() * pool.length); if (pool.length > 1 && i === S.lastDj) i = (i + 1) % pool.length; S.lastDj = i;
        const d = play(pool[i], A.buses.radio, R.station.id === 'talk' ? 0.9 : 0.8);
        if (d > 0) radioAudio.duck(d + 0.5, R.station.id === 'talk' ? 0.1 : 0.35);
        S.djT = (R.station.id === 'talk' ? 26 : 55) + Math.random() * 40;
      }
    } else S.djT = Math.min(S.djT, 12);
  }
  return { S, update, nav, dispatch, play, preload };
}

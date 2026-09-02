// Radio display (the audio side lives in audio/radio.js and reads this state).
import * as THREE from 'three';

export const STATIONS = [
  { id: 'surf', name: 'SURF FM', freq: '101.5', band: 'FM', now: 'Pelican Point Sunset Sessions' },
  { id: 'jazz', name: 'KJAZ', freq: '88.9', band: 'FM', now: 'Late Night Jazz' },
  { id: 'talk', name: 'KPCH', freq: '640', band: 'AM', now: 'Coast Traffic & Weather' },
];

export function buildRadio(M, anchors, game) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 56;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.048), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true })); screen.frustumCulled = false; anchors.radio.add(screen);
  const S = { on: false, index: 0, volume: 0.7, scroll: 0, station: null };
  let acc = 0;
  function draw() {
    g.fillStyle = '#080a0c'; g.fillRect(0, 0, 256, 56);
    if (!S.on || !(game.ignitionOn)) { g.fillStyle = '#1d2326'; g.font = '600 14px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(game.ignitionOn ? 'RADIO OFF' : '', 128, 28); tex.needsUpdate = true; return; }
    const st = STATIONS[S.index];
    g.fillStyle = '#ffb347'; g.font = '700 20px "Cascadia Mono", Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(`${st.freq} ${st.band}`, 8, 18);
    g.fillStyle = '#9fc7d8'; g.font = '600 12px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'right'; g.fillText(st.name, 248, 18);
    // scrolling now-playing
    g.save(); g.beginPath(); g.rect(8, 32, 240, 20); g.clip();
    g.fillStyle = '#d5dde2'; g.font = '500 12px "Segoe UI", Helvetica, Arial, sans-serif'; g.textAlign = 'left';
    const text = `♪ ${st.now}    `; const tw = g.measureText(text).width;
    const off = (S.scroll * 30) % tw;
    g.fillText(text + text, 8 - off, 42);
    g.restore();
    // volume bar
    g.fillStyle = '#2a3238'; g.fillRect(200, 38, 48, 4); g.fillStyle = '#ffb347'; g.fillRect(200, 38, 48 * S.volume, 4);
    tex.needsUpdate = true;
  }
  function cycle() { if (!S.on) { S.on = true; S.index = 0; } else if (S.index < STATIONS.length - 1) S.index++; else S.on = false; S.station = S.on ? STATIONS[S.index] : null; draw(); }
  function update(dt) { S.scroll += dt; acc += dt; if (acc > 0.25) { acc = 0; draw(); } }
  draw();
  return { S, cycle, update, canvas };
}

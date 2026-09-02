// Canvas texture factory. Everything visual is drawn here at boot; nothing is downloaded.
import * as THREE from 'three';
import { createRng } from './rng.js';

export function makeTextures(seed = 1) {
  const rng = createRng(seed);

  function canvasTex(w, h, draw, opts = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = opts.wrap === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = opts.aniso || 8;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.canvas = c;
    return t;
  }

  function noise(g, w, h, density, alphaMin, alphaMax, sizeMin, sizeMax, colors) {
    for (let i = 0; i < density; i++) {
      const x = rng() * w, y = rng() * h, s = sizeMin + rng() * (sizeMax - sizeMin);
      g.fillStyle = colors[Math.floor(rng() * colors.length)];
      g.globalAlpha = alphaMin + rng() * (alphaMax - alphaMin);
      g.fillRect(x, y, s, s);
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- road surfaces
  // Asphalt tile covering `widthM` metres across (u) by 12 m along (v). markings: [{ x (m from left), type, color, w }]
  function asphalt({ widthM = 8, markings = [], tint = '#2b2c2e', wear = true, size = 1024 }) {
    return canvasTex(size, size, (g, w, h) => {
      const pxPerM = w / widthM, pxPerMv = h / 12;
      g.fillStyle = tint; g.fillRect(0, 0, w, h);
      noise(g, w, h, 26000, 0.05, 0.22, 1, 3, ['#111', '#3a3b3d', '#4a4a48', '#202224', '#57534e']);
      noise(g, w, h, 4000, 0.03, 0.10, 4, 14, ['#1a1a1a', '#3d3d3f']);
      if (wear) {
        // lighter tyre-polished bands roughly where wheels run (lanes assumed 3.5 m)
        g.globalAlpha = 0.06; g.fillStyle = '#6b6a66';
        for (let x = 0.5; x < widthM; x += 3.5) { g.fillRect((x + 0.6) * pxPerM, 0, 0.55 * pxPerM, h); g.fillRect((x + 2.3) * pxPerM, 0, 0.55 * pxPerM, h); }
        g.globalAlpha = 1;
      }
      for (const m of markings) {
        const lw = (m.w || 0.12) * pxPerM;
        g.fillStyle = m.color || '#e8e2c8';
        g.globalAlpha = 0.92;
        const draw = (x0) => {
          if (m.type === 'dashed') { g.fillRect(x0 - lw / 2, 0, lw, 3 * pxPerMv); }
          else g.fillRect(x0 - lw / 2, 0, lw, h);
        };
        if (m.type === 'double') { draw(m.x * pxPerM - lw * 0.9); draw(m.x * pxPerM + lw * 0.9); }
        else draw(m.x * pxPerM);
        // paint wear
        g.globalAlpha = 1;
      }
      noise(g, w, h, 3000, 0.04, 0.12, 1, 3, ['#222', '#555']);
    }, { aniso: 16 });
  }
  const road2 = asphalt({ widthM: 8, markings: [{ x: 0.45, type: 'solid' }, { x: 4, type: 'double', color: '#d9b24a' }, { x: 7.55, type: 'solid' }] });
  const road2dash = asphalt({ widthM: 8, markings: [{ x: 0.45, type: 'solid' }, { x: 4, type: 'dashed', color: '#d9b24a' }, { x: 7.55, type: 'solid' }] });
  const road4 = asphalt({ widthM: 15.6, markings: [{ x: 0.45, type: 'solid' }, { x: 4, type: 'dashed' }, { x: 7.8, type: 'double', color: '#d9b24a' }, { x: 11.6, type: 'dashed' }, { x: 15.15, type: 'solid' }] });
  const street = asphalt({ widthM: 11, markings: [{ x: 5.5, type: 'double', color: '#d9b24a' }], tint: '#2e2f31' });
  const asphaltPlain = asphalt({ widthM: 8, markings: [], wear: false, size: 512 });

  const concrete = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#9a968c'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 9000, 0.05, 0.2, 1, 4, ['#6f6b62', '#b5b1a6', '#847f76']);
    g.strokeStyle = 'rgba(40,38,34,0.35)'; g.lineWidth = 3;
    g.strokeRect(2, 2, w - 4, h - 4);
  });
  const grass = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5c6b2e'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 16000, 0.15, 0.4, 1, 4, ['#3f4d1e', '#7a8a3a', '#8b8d45', '#4a5a26', '#a89a4a']);
  });
  const sand = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d9c497'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 14000, 0.08, 0.3, 1, 3, ['#c4ad7c', '#eadcb3', '#b8a06f']);
  });
  const rock = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7a6a56'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 6000, 0.1, 0.35, 2, 12, ['#5a4c3c', '#9a8a70', '#6e6250', '#8c7b62']);
    g.strokeStyle = 'rgba(30,25,20,0.4)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(rng() * w, rng() * h); g.lineTo(rng() * w, rng() * h); g.stroke(); }
  });

  // ---------------------------------------------------------------- interior
  const leather = (base, dark) => canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    noise(g, w, h, 30000, 0.05, 0.16, 1, 2, [dark, '#ffffff']);
    // grain cells
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
    for (let i = 0; i < 900; i++) { const x = rng() * w, y = rng() * h, r = 3 + rng() * 6; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
  });
  const leatherTan = leather('#8f5d3a', '#3a2214');
  const leatherBlack = leather('#1f1f22', '#050506');
  const plastic = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 12000, 0.04, 0.14, 1, 2, ['#000', '#3a3b3e']);
  });
  const plasticRough = canvasTex(256, 256, (g, w, h) => { // roughness map (linear)
    g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 12000, 0.2, 0.5, 1, 2, ['#9a9a9a', '#ffffff']);
  }, { srgb: false });
  const brushed = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9bcc2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(${rng() < 0.5 ? 60 : 240},${rng() < 0.5 ? 60 : 240},${rng() < 0.5 ? 70 : 250},${0.05 + rng() * 0.12})`; g.beginPath(); const y = rng() * h; g.moveTo(0, y); g.lineTo(w, y + (rng() - 0.5) * 2); g.stroke(); }
  });
  const carpet = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#17181a'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 20000, 0.1, 0.3, 1, 2, ['#000', '#2c2d30']);
  });
  const stitchTan = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8f5d3a'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 30000, 0.05, 0.16, 1, 2, ['#3a2214', '#ffffff']);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
    for (let x = 64; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = '#e7d6b0'; g.lineWidth = 2; g.setLineDash([9, 7]);
    for (let x = 58; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(x + 12, 0); g.lineTo(x + 12, h); g.stroke(); }
    g.setLineDash([]);
  });
  const speakerGrille = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#141517'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000';
    for (let y = 8; y < h; y += 12) for (let x = 8 + (y % 24 ? 6 : 0); x < w; x += 12) { g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); }
  });
  const woodTrim = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#4a2a16'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${20 + rng() * 40},${10 + rng() * 20},${5 + rng() * 10},${0.2 + rng() * 0.4})`; g.lineWidth = 1 + rng() * 3; g.beginPath(); const y = rng() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (rng() - 0.5) * 30, w * 0.6, y + (rng() - 0.5) * 30, w, y + (rng() - 0.5) * 10); g.stroke(); }
  });

  // ---------------------------------------------------------------- misc
  const generalNoise = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); noise(g, w, h, 20000, 0.2, 0.6, 1, 3, ['#000', '#fff']); }, { srgb: false });

  return {
    canvasTex, rng,
    road2, road2dash, road4, street, asphaltPlain, concrete, grass, sand, rock,
    leatherTan, leatherBlack, stitchTan, plastic, plasticRough, brushed, carpet, speakerGrille, woodTrim, generalNoise,
  };
}

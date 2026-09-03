// Procedural sedan cabin (LHD). Car-local frame: x right, y up (ground 0), −z forward.
// Returns named anchors that the wheel, gauges, controls, mirrors and nav modules attach to.
import * as THREE from 'three';
import { DEG } from '../units.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PL = (m, p, r) => { if (p) m.position.set(p[0], p[1], p[2]); if (r) m.rotation.set(r[0], r[1], r[2]); return m; };

export function buildInterior(M, T) {
  const root = new THREE.Group(); root.name = 'interior';
  const anchors = {};
  const add = (mesh, parent = root) => { mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const box = (w, h, d, mat, x, y, z, parent) => add(PL(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), [x, y, z], null), parent);
  const rounded = (w, h, r, depth, mat, opts = {}) => {
    const s = new THREE.Shape();
    const x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: opts.bevel || 0.015, bevelSize: opts.bevel || 0.015, bevelSegments: 3, curveSegments: 6 });
    g.center();
    return new THREE.Mesh(g, mat);
  };

  // ---------------------------------------------------------------- floor, roof, pillars
  add(PL(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.2), M.rep('carpet', 4, 8)), [0, 0.33, 0.7], [-Math.PI / 2, 0, 0]));
  box(1.6, 0.02, 2.5, M.headliner, 0, 1.44, 0.75);                       // headliner
  box(0.38, 0.22, 2.3, M.carpet, 0, 0.42, 0.55);                           // transmission tunnel
  // A pillars: from cowl corners up to the roof edge
  for (const sgn of [-1, 1]) {
    {
      const a = new THREE.Vector3(sgn * 0.76, 0.98, -0.95), b = new THREE.Vector3(sgn * 0.70, 1.42, -0.28);
      const len = a.distanceTo(b);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, len, 6), M.dashDark);
      p.position.copy(a).lerp(b, 0.5); p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      add(p);
    }
    box(0.06, 0.48, 0.10, M.dashDark, sgn * 0.78, 1.20, 0.94);            // B pillars
    box(0.05, 0.40, 0.09, M.dashDark, sgn * 0.74, 1.15, 1.95);            // C pillars
    box(0.16, 0.02, 2.3, M.headliner, sgn * 0.75, 1.43, 0.75);             // roof rails
  }
  // windshield header + sun visors
  box(1.56, 0.045, 0.07, M.headliner, 0, 1.415, -0.30);
  for (const sgn of [-1, 1]) { const v = box(0.26, 0.01, 0.11, M.headliner, sgn * 0.40, 1.395, -0.22); v.rotation.x = 8 * DEG; }

  // ---------------------------------------------------------------- dash (side profile extruded across)
  {
    const s = new THREE.Shape(); // in (−z, y): x_s = -z_car
    const P = [[0.95, 0.99], [0.75, 1.005], [0.55, 1.0], [0.46, 0.985], [0.40, 0.955], [0.36, 0.91], [0.345, 0.84], [0.36, 0.74], [0.42, 0.65], [0.50, 0.58], [0.70, 0.55], [0.95, 0.55]];
    s.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    const dash = new THREE.Mesh(g, M.rep('dashSoft', 4, 2));
    dash.rotation.y = Math.PI / 2; dash.position.x = -0.81; add(dash);
  }
  // dash top soft strip + defroster vents
  for (let x = -0.62; x <= 0.62; x += 0.31) { const v = box(0.22, 0.006, 0.05, M.pianoBlack, x, 1.006, -0.86); }
  // door-to-dash trim strip (brushed)
  box(1.6, 0.03, 0.02, M.trim, 0, 0.80, -0.35);
  // glovebox
  box(1.58, 0.21, 0.03, M.rep('leatherTan', 6, 1), 0, 0.67, -0.335);
  box(0.08, 0.012, 0.012, M.trim, 0.42, 0.78, -0.325);

  // ---------------------------------------------------------------- instrument binnacle + hood
  {
    const binn = new THREE.Group(); binn.position.set(-0.37, 0.955, -0.50); binn.rotation.x = -20 * DEG; add(binn);
    const face = box(0.42, 0.20, 0.02, M.pianoBlack, 0, 0, 0, binn);
    anchors.cluster = new THREE.Object3D(); anchors.cluster.position.set(0, 0, 0.011); binn.add(anchors.cluster);
    // quarter-arch over the top (from the crest backwards) + flat visor reaching forward over the cluster
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.46, 18, 1, true, Math.PI / 2, Math.PI / 2), M.rep('dashSoft', 2, 1));
    hood.material.side = THREE.DoubleSide;
    hood.rotation.z = Math.PI / 2; hood.position.set(0, 0.02, -0.02); add(hood, binn);
    const visor = box(0.46, 0.012, 0.16, M.rep('dashSoft', 2, 1), 0, 0.122, 0.05, binn); visor.rotation.x = 3 * DEG;
    box(0.46, 0.012, 0.02, M.pianoBlack, 0, 0.118, 0.13, binn); // visor lip
    // bezel around the cluster
    box(0.44, 0.012, 0.03, M.dashDark, 0, -0.105, 0.005, binn);
    box(0.012, 0.22, 0.03, M.dashDark, -0.215, 0.0, 0.005, binn); box(0.012, 0.22, 0.03, M.dashDark, 0.215, 0.0, 0.005, binn);
  }

  // ---------------------------------------------------------------- steering column
  {
    const col = new THREE.Group(); col.position.set(-0.37, 0.86, -0.20); col.rotation.x = -27 * DEG; add(col);
    anchors.column = col;
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.26, 16), M.dashSoft);
    shroud.rotation.x = Math.PI / 2; shroud.position.z = -0.16; add(shroud, col);
    const shroudBox = box(0.13, 0.09, 0.14, M.dashSoft, 0, -0.01, -0.22, col);
    anchors.wheelHub = new THREE.Object3D(); anchors.wheelHub.position.set(0, 0, 0.02); col.add(anchors.wheelHub);
    // stalks
    anchors.stalkL = new THREE.Object3D(); anchors.stalkL.position.set(-0.05, 0, -0.10); col.add(anchors.stalkL);
    const sl = box(0.13, 0.022, 0.024, M.dashDark, -0.065, 0, 0, anchors.stalkL); sl.rotation.y = 6 * DEG; box(0.03, 0.026, 0.028, M.pianoBlack, -0.13, 0, 0, anchors.stalkL);
    anchors.stalkR = new THREE.Object3D(); anchors.stalkR.position.set(0.05, 0, -0.10); col.add(anchors.stalkR);
    const sr = box(0.13, 0.022, 0.024, M.dashDark, 0.065, 0, 0, anchors.stalkR); sr.rotation.y = -6 * DEG; box(0.03, 0.026, 0.028, M.pianoBlack, 0.13, 0, 0, anchors.stalkR);
  }

  // ---------------------------------------------------------------- center stack + console
  {
    const stack = new THREE.Group(); stack.position.set(0, 0.86, -0.40); stack.rotation.x = -12 * DEG; add(stack);
    add(PL(rounded(0.34, 0.30, 0.03, 0.03, M.rep('dashSoft', 2, 2)), [0, 0.02, -0.02], null), stack);
    // nav bezel + screen anchor
    box(0.30, 0.175, 0.012, M.pianoBlack, 0, 0.07, 0.006, stack);
    anchors.nav = new THREE.Object3D(); anchors.nav.position.set(0, 0.07, 0.0135); stack.add(anchors.nav);
    // radio display + buttons
    box(0.24, 0.05, 0.012, M.pianoBlack, 0, -0.05, 0.006, stack);
    anchors.radio = new THREE.Object3D(); anchors.radio.position.set(0, -0.05, 0.0135); stack.add(anchors.radio);
    for (let i = -2; i <= 2; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 12), M.trim); k.rotation.x = Math.PI / 2; k.position.set(i * 0.06, -0.10, 0.012); add(k, stack); }
    // HVAC knobs
    for (const x of [-0.10, 0.10]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.02, 20), M.pianoBlack); k.rotation.x = Math.PI / 2; k.position.set(x, -0.13, 0.014); add(k, stack); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.003, 8, 24), M.trim); ring.position.set(x, -0.13, 0.024); add(ring, stack); }
    // vents
    for (const x of [-0.14, 0.14]) { box(0.06, 0.05, 0.01, M.dashDark, x, 0.19, 0.0, stack); for (let j = -2; j <= 2; j++) box(0.056, 0.004, 0.012, M.trim, x, 0.19 + j * 0.01, 0.002, stack); }
  }
  // console
  box(0.34, 0.16, 1.1, M.rep('dashSoft', 2, 4), 0, 0.55, 0.42);
  box(0.30, 0.012, 0.40, M.pianoBlack, 0, 0.632, 0.05);                      // shifter surround
  anchors.shifter = new THREE.Object3D(); anchors.shifter.position.set(0.0, 0.635, 0.05); root.add(anchors.shifter);
  anchors.handbrake = new THREE.Object3D(); anchors.handbrake.position.set(0.0, 0.64, 0.42); root.add(anchors.handbrake);
  // cup holders
  for (const z of [0.66, 0.78]) { const c = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.038, 0), new THREE.Vector2(0.04, 0.06), new THREE.Vector2(0.046, 0.062)], 20), M.dashDark); c.position.set(0.0, 0.58, z); add(c); }
  // armrest
  add(PL(rounded(0.26, 0.09, 0.03, 0.34, M.rep('leatherBlack', 2, 2)), [0, 0.68, 1.02], null));

  // ---------------------------------------------------------------- pedals
  anchors.pedals = {};
  const pedalBase = new THREE.Group(); pedalBase.position.set(-0.37, 0.36, -0.72); add(pedalBase);
  for (const [name, x, w] of [['clutch', -0.15, 0.06], ['brake', -0.02, 0.09], ['throttle', 0.11, 0.05]]) {
    const piv = new THREE.Object3D(); piv.position.set(x, 0, 0); pedalBase.add(piv);
    const arm = box(0.02, 0.16, 0.02, M.dashDark, 0, 0.08, 0, piv);
    const pad = box(w, name === 'throttle' ? 0.13 : 0.07, 0.015, M.rubber, 0, name === 'throttle' ? 0.10 : 0.14, 0.012, piv);
    piv.rotation.x = 22 * DEG;
    anchors.pedals[name] = piv;
  }
  box(0.10, 0.10, 0.02, M.rubber, -0.66, 0.42, -0.70); // dead pedal

  // ---------------------------------------------------------------- seats
  const seat = (x) => {
    const g = new THREE.Group(); g.position.set(x, 0, 0.30); add(g);
    add(PL(rounded(0.52, 0.16, 0.06, 0.52, M.rep('seatTan', 2, 2)), [0, 0.50, 0.0], [-6 * DEG, 0, 0]), g);
    const back = add(PL(rounded(0.50, 0.62, 0.07, 0.14, M.rep('seatTan', 2, 3)), [0, 0.86, 0.30], [-16 * DEG, 0, 0]), g);
    for (const sgn of [-1, 1]) add(PL(rounded(0.09, 0.50, 0.04, 0.18, M.leatherTan), [sgn * 0.24, 0.84, 0.28], [-16 * DEG, 0, 0]), g);
    add(PL(rounded(0.24, 0.12, 0.05, 0.10, M.leatherTan), [0, 1.27, 0.40], null), g);
    box(0.02, 0.10, 0.02, M.chrome, -0.06, 1.17, 0.40, g); box(0.02, 0.10, 0.02, M.chrome, 0.06, 1.17, 0.40, g);
    return g;
  };
  seat(-0.37); seat(0.37);
  // rear bench
  add(PL(rounded(1.30, 0.16, 0.06, 0.50, M.rep('seatTan', 4, 2)), [0, 0.50, 1.55], null));
  add(PL(rounded(1.30, 0.62, 0.07, 0.14, M.rep('seatTan', 4, 3)), [0, 0.86, 1.86], [-18 * DEG, 0, 0]));
  box(1.4, 0.03, 0.42, M.carpet, 0, 1.06, 2.20); // rear shelf

  // ---------------------------------------------------------------- doors
  for (const sgn of [-1, 1]) {
    const door = new THREE.Group(); door.position.set(sgn * 0.80, 0, 0); add(door);
    // front door card
    box(0.03, 0.62, 1.30, M.rep('dashSoft', 3, 2), 0, 0.66, 0.30, door);
    box(0.05, 0.08, 1.30, M.rep('dashSoft', 3, 1), sgn * -0.01, 0.985, 0.30, door);        // sill/belt line
    box(0.06, 0.05, 0.42, M.leatherTan, sgn * -0.03, 0.78, 0.35, door);                     // armrest
    box(0.02, 0.012, 0.10, M.trim, sgn * -0.055, 0.82, 0.05, door);                          // handle
    box(0.02, 0.03, 0.08, M.pianoBlack, sgn * -0.05, 0.86, 0.70, door);                      // window switch
    add(PL(new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), M.grille), [sgn * -0.016, 0.52, 0.10], [0, sgn * -Math.PI / 2, 0]), door);
    // rear door card
    box(0.03, 0.62, 0.95, M.rep('dashSoft', 3, 2), 0, 0.66, 1.45, door);
    box(0.05, 0.08, 0.95, M.rep('dashSoft', 3, 1), sgn * -0.01, 0.985, 1.45, door);
    // glass
    add(PL(new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.42), M.glass), [sgn * 0.005, 1.22, 0.30], [0, Math.PI / 2, 0]), door);
    add(PL(new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.40), M.glass), [sgn * 0.005, 1.21, 1.45], [0, Math.PI / 2, 0]), door);
  }

  // ---------------------------------------------------------------- windshield, rear glass, mirror mounts
  {
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.50, 0.78), M.glass);
    ws.position.set(0, 1.21, -0.60); ws.rotation.x = (90 - 31) * DEG; add(ws);
    anchors.windshield = ws;
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(1.50, 0.10), M.glassTint);
    tint.position.set(0, 1.385, -0.31); tint.rotation.x = (90 - 31) * DEG; add(tint);
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.52), M.glass);
    rear.position.set(0, 1.20, 2.20); rear.rotation.x = -(90 - 28) * DEG; add(rear);
    anchors.rearMirror = new THREE.Object3D(); anchors.rearMirror.position.set(0, 1.30, -0.36); root.add(anchors.rearMirror);
    const stalk = box(0.02, 0.06, 0.02, M.dashDark, 0, 0.04, -0.02, anchors.rearMirror);
    anchors.sideMirrorL = new THREE.Object3D(); anchors.sideMirrorL.position.set(-0.98, 1.02, -0.30); root.add(anchors.sideMirrorL);
    anchors.sideMirrorR = new THREE.Object3D(); anchors.sideMirrorR.position.set(0.98, 1.02, -0.30); root.add(anchors.sideMirrorR);
    anchors.domeLight = new THREE.Object3D(); anchors.domeLight.position.set(0, 1.42, 0.35); root.add(anchors.domeLight);
    anchors.wipers = new THREE.Object3D(); anchors.wipers.position.set(0, 1.0, -0.98); root.add(anchors.wipers);
  }

  root.traverse((o) => { if (o.isMesh) { o.layers.set(0); o.frustumCulled = false; } });
  mergeStatic(root, anchors);
  return { root, anchors };
}

// Merge every static cabin mesh per material into one draw call each; anything under an animated anchor
// (wheel hub, stalks, pedals, shifter, handbrake, mirrors, screens, wipers) is left alone.
function mergeStatic(root, anchors) {
  const animated = new Set();
  const mark = (o) => { if (!o) return; o.traverse((c) => animated.add(c)); };
  for (const k of ['wheelHub', 'stalkL', 'stalkR', 'shifter', 'handbrake', 'rearMirror', 'sideMirrorL', 'sideMirrorR', 'nav', 'radio', 'cluster', 'wipers', 'domeLight', 'windshield']) mark(anchors[k]);
  for (const k in anchors.pedals || {}) mark(anchors.pedals[k]);
  root.updateMatrixWorld(true);
  const byMat = new Map(), remove = [];
  root.traverse((o) => {
    if (!o.isMesh || animated.has(o) || o.material.transparent) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const flat = g.index ? g.toNonIndexed() : g;
    if (!flat.attributes.uv) flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
    if (!flat.attributes.normal) flat.computeVertexNormals();
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(flat); remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.receiveShadow = true; m.frustumCulled = false; m.layers.set(0); m.name = 'cabin-merged'; root.add(m);
  }
}

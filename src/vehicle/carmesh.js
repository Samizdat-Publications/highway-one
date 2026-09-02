// Exterior shell seen from the driver's seat and in the mirrors: hood, fenders, roof, doors, tail,
// wheels, lamps. Lives on layers 0 and 2 (mirrors render layer 2 only). Interior stays on layer 0.
import * as THREE from 'three';
import { DEG } from '../units.js';

const PL = (m, p, r) => { if (p) m.position.set(p[0], p[1], p[2]); if (r) m.rotation.set(r[0], r[1], r[2]); return m; };

export function buildCarMesh(M, C) {
  const root = new THREE.Group(); root.name = 'exterior';
  const add = (m) => { m.castShadow = true; m.receiveShadow = true; m.layers.enable(2); root.add(m); return m; };
  const box = (w, h, d, mat, x, y, z) => add(PL(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), [x, y, z], null));
  const paint = M.paint;

  // hood: slab sloping from cowl (z −0.98, y 1.0) to nose (z −2.2, y 0.84), width tapering
  {
    const s = new THREE.Shape(); // side profile in (−z, y)
    s.moveTo(0.98, 1.0); s.lineTo(1.4, 0.96); s.lineTo(1.9, 0.88); s.lineTo(2.2, 0.84); s.lineTo(2.25, 0.62); s.lineTo(0.98, 0.70); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.72, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 });
    const hood = new THREE.Mesh(g, paint); hood.rotation.y = Math.PI / 2; hood.position.x = -0.86; add(hood);
    // power bulge
    const bulge = box(0.5, 0.02, 1.1, paint, 0, 0.985, -1.55); bulge.rotation.x = -5 * DEG;
    // fender crests
    for (const sgn of [-1, 1]) { const f = box(0.16, 0.05, 1.25, paint, sgn * 0.84, 0.95, -1.6); f.rotation.x = -5 * DEG; }
  }
  // cowl / wiper tray
  box(1.6, 0.06, 0.16, M.rubber, 0, 0.98, -0.95);
  // roof
  box(1.55, 0.04, 2.0, paint, 0, 1.47, 0.75);
  // doors / body sides
  for (const sgn of [-1, 1]) {
    box(0.06, 0.62, 2.25, paint, sgn * 0.88, 0.66, 0.85);     // side body
    box(0.06, 0.12, 2.25, M.paintDark, sgn * 0.88, 0.32, 0.85); // sill
    // side mirror housing
    const mir = new THREE.Group(); mir.position.set(sgn * 0.98, 1.02, -0.30); root.add(mir);
    const h = box(0.20, 0.11, 0.09, paint, 0, 0, 0); mir.add(h); h.position.set(sgn * 0.02, 0, 0);
    const arm = box(0.08, 0.04, 0.05, M.paintDark, sgn * -0.08, -0.03, 0.02); mir.add(arm);
    mir.userData.isMirror = sgn;
    root.userData['mirror' + (sgn < 0 ? 'L' : 'R')] = mir;
  }
  // rear
  box(1.7, 0.6, 0.9, paint, 0, 0.66, 2.55);
  box(1.6, 0.30, 0.5, paint, 0, 1.06, 2.35);
  // wheels
  const tyreG = new THREE.CylinderGeometry(C.wheelRadius, C.wheelRadius, 0.22, 24), rimG = new THREE.CylinderGeometry(0.19, 0.19, 0.23, 12);
  const wheels = [];
  const a = C.wheelbase * (1 - C.frontWeight), b = C.wheelbase * C.frontWeight;
  for (const [u, w] of [[a, -C.track / 2], [a, C.track / 2], [-b, -C.track / 2], [-b, C.track / 2]]) {
    const piv = new THREE.Group(); piv.position.set(w, C.wheelRadius, -u); root.add(piv);
    const spin = new THREE.Group(); piv.add(spin);
    const t = new THREE.Mesh(tyreG, M.tyre); t.rotation.z = Math.PI / 2; t.castShadow = true; t.layers.enable(2); spin.add(t);
    const r = new THREE.Mesh(rimG, M.chrome); r.rotation.z = Math.PI / 2; r.layers.enable(2); spin.add(r);
    wheels.push({ piv, spin });
  }
  // lamps (materials shared so lights.js can drive emissive)
  const lamps = {};
  lamps.tailL = box(0.30, 0.10, 0.03, M.lensRed, -0.62, 0.86, 3.005); lamps.tailR = box(0.30, 0.10, 0.03, M.lensRed, 0.62, 0.86, 3.005);
  lamps.revL = box(0.10, 0.06, 0.03, M.lensWhite, -0.40, 0.82, 3.005); lamps.revR = box(0.10, 0.06, 0.03, M.lensWhite, 0.40, 0.82, 3.005);
  lamps.sigRL = box(0.08, 0.06, 0.03, M.lensAmber.clone(), -0.82, 0.86, 3.005); lamps.sigRR = box(0.08, 0.06, 0.03, M.lensAmber.clone(), 0.82, 0.86, 3.005);
  lamps.headL = box(0.36, 0.14, 0.04, M.lensWhite.clone(), -0.62, 0.78, -2.25); lamps.headR = box(0.36, 0.14, 0.04, M.lensWhite.clone(), 0.62, 0.78, -2.25);
  lamps.sigFL = box(0.10, 0.06, 0.04, M.lensAmber.clone(), -0.86, 0.72, -2.24); lamps.sigFR = box(0.10, 0.06, 0.04, M.lensAmber.clone(), 0.86, 0.72, -2.24);
  lamps.sideL = box(0.03, 0.04, 0.08, M.lensAmber.clone(), -0.91, 0.90, -1.0); lamps.sideR = box(0.03, 0.04, 0.08, M.lensAmber.clone(), 0.91, 0.90, -1.0);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  function update(car) {
    const W = car.wheels;
    for (let i = 0; i < 4; i++) { wheels[i].piv.rotation.y = -W[i].steer; wheels[i].spin.rotation.x = -W[i].spin; }
  }
  return { root, wheels, lamps, update };
}

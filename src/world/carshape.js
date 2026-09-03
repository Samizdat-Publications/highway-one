// Shared sedan silhouette for traffic and parked cars: a side profile extruded across the body width,
// a darker greenhouse extrude for the glass, and a wheel. Origin at ground level under the car centre, −z forward.
import * as THREE from 'three';

export function makeCarGeometries(width = 1.76) {
  const profile = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
  // (z, y): front bumper → hood → windshield → roof → rear glass → trunk → rear bumper → underside
  const body = profile([[-2.25, 0.36], [-2.2, 0.62], [-1.85, 0.72], [-0.7, 0.8], [-0.55, 0.84], [0.2, 1.3], [1.0, 1.32], [1.55, 1.02], [2.15, 0.92], [2.25, 0.62], [2.25, 0.36], [1.75, 0.3], [1.35, 0.14], [1.0, 0.3], [-1.0, 0.3], [-1.35, 0.14], [-1.75, 0.3]]);
  const bodyG = new THREE.ExtrudeGeometry(body, { depth: width, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 4 });
  bodyG.rotateY(Math.PI / 2); bodyG.translate(-width / 2 - 0.06, 0, 0);
  // greenhouse: windows as a thin darker shell over the cabin part of the profile
  const glass = profile([[-0.5, 0.86], [0.25, 1.26], [0.98, 1.28], [1.5, 1.0], [1.5, 0.9], [-0.5, 0.86]]);
  const glassG = new THREE.ExtrudeGeometry(glass, { depth: width + 0.04, bevelEnabled: false });
  glassG.rotateY(Math.PI / 2); glassG.translate(-width / 2 - 0.02, 0.012, 0);
  const wheelG = new THREE.CylinderGeometry(0.31, 0.31, 0.22, 14); wheelG.rotateZ(Math.PI / 2);
  const hubG = new THREE.CylinderGeometry(0.2, 0.2, 0.23, 8); hubG.rotateZ(Math.PI / 2);
  bodyG.computeVertexNormals(); glassG.computeVertexNormals();
  return { bodyG, glassG, wheelG, hubG, wheelOffsets: [[0.82, -1.42], [-0.82, -1.42], [0.82, 1.42], [-0.82, 1.42]] };
}

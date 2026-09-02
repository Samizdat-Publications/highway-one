// Rear-view + two side mirrors: each is a small render target drawn from a camera at the mirror
// looking along the reflected eye ray. Mirror cameras see layer 2 only (world + exterior; never the cabin).
import * as THREE from 'three';

export function buildMirrors(M, anchors, exterior, scene, renderer, quality) {
  const mirrors = [];
  const mk = (anchor, w, h, rtW, rtH, fov, normalLocal, sideSign) => {
    const rt = new THREE.WebGLRenderTarget(rtW, rtH, { depthBuffer: true, samples: 0 });
    rt.texture.generateMipmaps = false; rt.texture.minFilter = THREE.LinearFilter;
    rt.texture.repeat.x = -1; rt.texture.offset.x = 1; rt.texture.wrapS = THREE.RepeatWrapping;
    const cam = new THREE.PerspectiveCamera(fov, rtW / rtH, 0.5, 400);
    cam.layers.set(2);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: true }));
    glass.frustumCulled = false;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.02), M.pianoBlack); housing.position.z = -0.012; housing.frustumCulled = false;
    const grp = new THREE.Group(); grp.add(glass); grp.add(housing); anchor.add(grp);
    // glass faces +z local (toward the driver at +z) — housing behind it
    return { rt, cam, glass, grp, normalLocal, anchor, sideSign };
  };
  const q = quality;
  // rear-view: 0.24 × 0.07, faces the driver (driver sits at −x, so yaw the mirror a little toward −x)
  const rear = mk(anchors.rearMirror, 0.24, 0.07, 256 * 2, 72 * 2, 30);
  rear.grp.position.set(0, 0, 0); rear.grp.rotation.set(-6 * Math.PI / 180, 14 * Math.PI / 180, 0);
  // side mirrors: glass in the exterior housings, angled toward the driver
  const sideL = mk(anchors.sideMirrorL, 0.15, 0.10, 192, 128, 26, null, -1);
  sideL.grp.position.set(0.0, 0, 0.05); sideL.grp.rotation.set(0, 26 * Math.PI / 180, 0);
  const sideR = mk(anchors.sideMirrorR, 0.15, 0.10, 192, 128, 26, null, 1);
  sideR.grp.position.set(0.0, 0, 0.05); sideR.grp.rotation.set(0, -32 * Math.PI / 180, 0);
  mirrors.push(rear, sideL, sideR);

  const eyeW = new THREE.Vector3(), mirW = new THREE.Vector3(), nW = new THREE.Vector3(), d = new THREE.Vector3(), r = new THREE.Vector3(), tgt = new THREE.Vector3(), upW = new THREE.Vector3(0, 1, 0);
  const nLocal = new THREE.Vector3(0, 0, 1);
  let frame = 0;
  function render(camera) {
    frame++;
    if (frame % q.mirrorEvery !== 0) return;
    const step = Math.floor(frame / q.mirrorEvery);
    const which = step % 2 === 0 ? [rear] : [step % 4 === 1 ? sideL : sideR];
    camera.getWorldPosition(eyeW);
    for (const m of which) {
      m.glass.getWorldPosition(mirW);
      nW.copy(nLocal).transformDirection(m.glass.matrixWorld).normalize();
      d.subVectors(mirW, eyeW).normalize();
      r.copy(d).addScaledVector(nW, -2 * d.dot(nW)).normalize();
      m.cam.position.copy(mirW).addScaledVector(r, 0.15);
      tgt.copy(m.cam.position).add(r);
      m.cam.up.copy(upW); m.cam.lookAt(tgt); m.cam.updateMatrixWorld(true);
      m.glass.visible = false;
      renderer.setRenderTarget(m.rt); renderer.render(scene, m.cam); renderer.setRenderTarget(null);
      m.glass.visible = true;
    }
  }
  return { mirrors, render };
}

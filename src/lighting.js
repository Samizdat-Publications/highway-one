// Sun + moon + hemisphere, follow-shadow that snaps to its texel grid, and a pool of recycled
// point lights for street/pier/tunnel lamps near the player (added to in later phases).
import * as THREE from 'three';
import { lerp, smoothstep, clamp } from './units.js';

export function createLighting(scene, renderer, sky, quality) {
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  const sc = sun.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 240;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const moon = new THREE.DirectionalLight(0x9fb4d8, 0.06); scene.add(moon); scene.add(moon.target);
  const hemi = new THREE.HemisphereLight(0xbfd7ea, 0x55606a, 0.9); scene.add(hemi);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const S = { streetOn: false };
  const warmGround = new THREE.Color(0x8a7458);
  const tmp = new THREE.Vector3(), lightSpace = new THREE.Matrix4(), inv = new THREE.Matrix4();

  function update(dt, focus /* Vector3 */, forward /* Vector3 */) {
    const K = sky.S;
    sun.intensity = K.sunIntensity;
    sun.color.copy(K.sunColor);
    sun.visible = sun.intensity > 0.01;
    // keep the shadow frustum ahead of the car and snap to texel size to stop shimmering
    const ahead = tmp.copy(forward).multiplyScalar(22).add(focus);
    const texel = (sc.right - sc.left) / quality.shadow;
    sun.position.copy(K.sunDir).multiplyScalar(120).add(ahead);
    sun.target.position.copy(ahead);
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    lightSpace.lookAt(sun.position, sun.target.position, new THREE.Vector3(0, 1, 0));
    inv.copy(lightSpace).invert();
    const p = ahead.clone().applyMatrix4(inv);
    p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(lightSpace);
    sun.target.position.copy(p); sun.position.copy(K.sunDir).multiplyScalar(120).add(p);
    sun.target.updateMatrixWorld();

    moon.position.copy(K.moonDir).multiplyScalar(100).add(focus); moon.target.position.copy(focus); moon.target.updateMatrixWorld();
    moon.intensity = 0.06 * K.night;
    hemi.color.copy(K.horizonColor).lerp(K.zenithColor, 0.35);
    hemi.groundColor.copy(sky.u.ground.value).lerp(warmGround, 0.6 * K.daylight);
    hemi.intensity = lerp(0.06, 0.38, K.daylight);
    S.streetOn = K.sunElev < 2;
  }

  return { sun, moon, hemi, S, update };
}

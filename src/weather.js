// Weather: clear / fog / rain with cross-fades. Drives fog density, a rain streak sheet in front of the
// camera, wet-road material blending (and grip via car.S.wetness), sky haze, and the windshield droplets.
import * as THREE from 'three';
import { clamp, lerp, damp } from './units.js';

const KINDS = {
  clear: { fog: 0.0009, rain: 0, wet: 0, haze: 0, sun: 1 },
  fog: { fog: 0.011, rain: 0, wet: 0.3, haze: 1, sun: 0.35 },
  rain: { fog: 0.0032, rain: 1, wet: 1, haze: 0.7, sun: 0.25 },
};

export function createWeather(scene, camera, sky, M, wipers, car, quality) {
  const S = { kind: 'clear', fog: 0.0009, rain: 0, wet: 0, haze: 0, sun: 1, blendRate: 1 / 8 };
  const target = { ...KINDS.clear };
  const dryRoad = {}, wetRoad = { colorMul: 0.62, roughness: 0.34, env: 1.3 };
  const roadMats = ['road2', 'road2dash', 'road4', 'street', 'asphalt', 'concrete'].map((k) => M[k]).filter(Boolean);
  for (const m of roadMats) dryRoad[m.uuid] = { color: m.color.clone(), roughness: m.roughness, env: m.envMapIntensity };

  // rain streaks
  const N = quality.rain;
  const geo = new THREE.PlaneGeometry(0.018, 0.36);
  const mat = new THREE.MeshBasicMaterial({ color: 0xcfe0ee, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const rainMesh = new THREE.InstancedMesh(geo, mat, N); rainMesh.frustumCulled = false; rainMesh.visible = false; rainMesh.layers.set(0);
  rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(rainMesh);
  const box = { w: 14, h: 9, d: 16 };
  const drops = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { drops[i * 3] = (Math.random() - 0.5) * box.w; drops[i * 3 + 1] = Math.random() * box.h; drops[i * 3 + 2] = (Math.random() - 0.5) * box.d; }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const camPos = new THREE.Vector3(), camDir = new THREE.Vector3();

  function set(kind, instant) {
    if (!KINDS[kind]) return;
    S.kind = kind; Object.assign(target, KINDS[kind]);
    if (instant) { S.fog = target.fog; S.rain = target.rain; S.wet = target.wet; S.haze = target.haze; S.sun = target.sun; }
  }
  const grey = new THREE.Color(0x8e959b);
  function update(dt) {
    const k = 1 - Math.exp(-dt * S.blendRate * 3);
    S.fog = lerp(S.fog, target.fog, k); S.rain = lerp(S.rain, target.rain, k); S.haze = lerp(S.haze, target.haze, k); S.sun = lerp(S.sun, target.sun, k);
    S.wet = lerp(S.wet, target.wet, k * (target.wet > S.wet ? 0.6 : 0.25)); // dries slower than it soaks
    scene.fog.density = S.fog;
    // wet materials
    for (const m of roadMats) { const d = dryRoad[m.uuid]; m.color.copy(d.color).multiplyScalar(lerp(1, wetRoad.colorMul, S.wet)); m.roughness = lerp(d.roughness, wetRoad.roughness, S.wet); m.envMapIntensity = lerp(d.env, wetRoad.env, S.wet); }
    car.S.wetness = S.wet;
    wipers.setRain(S.rain * 0.9);
    // sky: haze greys the horizon and dims the sun
    sky.S.sunIntensity *= S.sun;
    sky.u.horizon.value.lerp(grey, S.haze * 0.6);
    sky.u.zenith.value.lerp(grey, S.haze * 0.75);
    if (scene.fog) scene.fog.color.copy(sky.u.horizon.value);
    sky.u.glow.value *= 1 - S.haze * 0.8;
    // rain sheet
    const inTunnel = car.S.inTunnel;
    rainMesh.visible = S.rain > 0.02 && !inTunnel;
    if (rainMesh.visible) {
      mat.opacity = 0.32 * S.rain;
      camera.getWorldPosition(camPos); camera.getWorldDirection(camDir);
      const vx = car.S.vx, vz = car.S.vz;
      const leanX = -vx * 0.045, leanZ = -vz * 0.045;
      const yaw = Math.atan2(camDir.x, camDir.z);
      e.set(0, yaw, 0); q.setFromEuler(e);
      const fall = 9 * dt;
      for (let i = 0; i < N; i++) {
        let y = drops[i * 3 + 1] - fall; if (y < 0) { y += box.h; drops[i * 3] = (Math.random() - 0.5) * box.w; drops[i * 3 + 2] = (Math.random() - 0.5) * box.d; }
        drops[i * 3 + 1] = y;
        p.set(camPos.x + camDir.x * 5 + drops[i * 3] + leanX * (y / box.h), camPos.y - 3 + y, camPos.z + camDir.z * 5 + drops[i * 3 + 2] + leanZ * (y / box.h));
        m4.compose(p, q, sc); rainMesh.setMatrixAt(i, m4);
      }
      rainMesh.instanceMatrix.needsUpdate = true;
    }
  }
  return { S, set, update, rainMesh };
}

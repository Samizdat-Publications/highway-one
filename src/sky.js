// Sky dome (gradient + sun disc + stars), sun/moon direction from the hour, fog colour tracking.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, DEG } from './units.js';

const vert = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const frag = `
  uniform vec3 zenith, horizon, ground, sunColor; uniform vec3 sunDir; uniform float sunSize, glow, night, haze;
  varying vec3 vDir;
  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    float t = smoothstep(-0.02, 0.35, h);
    vec3 col = mix(horizon, zenith, pow(t, 0.7));
    col = mix(ground, col, smoothstep(-0.12, 0.0, h));
    float sd = max(dot(d, sunDir), 0.0);
    // sun glow + disc
    col += sunColor * pow(sd, 6.0) * glow * 0.35;
    col += sunColor * pow(sd, 48.0) * glow * 0.5;
    col += sunColor * smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.3, sd) * 3.0 * step(-0.03, sunDir.y);
    // horizon haze band
    col += horizon * (1.0 - smoothstep(0.0, 0.18, abs(h))) * haze * 0.35;
    // stars
    if (night > 0.01 && h > 0.0) {
      vec3 g = floor(d * 260.0);
      float s = hash(g);
      float star = step(0.9965, s) * smoothstep(0.0, 0.05, h);
      float tw = 0.6 + 0.4 * sin(hash(g + 1.0) * 6.28 + hash(g) * 30.0);
      col += vec3(star) * night * tw * 0.9;
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createSky(scene) {
  const u = {
    zenith: { value: new THREE.Color(0x2f6fbf) }, horizon: { value: new THREE.Color(0xbfd7ea) }, ground: { value: new THREE.Color(0x55606a) },
    sunColor: { value: new THREE.Color(0xfff2d8) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunSize: { value: 0.0025 },
    glow: { value: 1 }, night: { value: 0 }, haze: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), mat);
  dome.frustumCulled = false; dome.renderOrder = -10; dome.userData.noMerge = true;
  scene.add(dome);

  // PMREM environment from the same dome so interior plastics/chrome pick up sky reflections
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat); envScene.add(envDome);
  let pmrem = null, envTarget = null, envElev = -999;
  function refreshEnvironment(renderer, force) {
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    if (!force && Math.abs(S.sunElev - envElev) < 4) return;
    envElev = S.sunElev;
    const old = envTarget;
    envTarget = pmrem.fromScene(envScene, 0.02);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.2 + 0.4 * S.daylight;
    if (old) old.dispose();
  }

  // cloud layer: a high plane with a soft canvas cloud texture scrolling slowly, tinted by the sun
  const cloudCanvas = document.createElement('canvas'); cloudCanvas.width = 1024; cloudCanvas.height = 1024;
  {
    const g = cloudCanvas.getContext('2d'); g.clearRect(0, 0, 1024, 1024);
    let s = 12345; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 26; i++) {
      const cx = rnd() * 1024, cy = rnd() * 1024, n = 6 + Math.floor(rnd() * 10), size = 40 + rnd() * 90;
      for (let k = 0; k < n; k++) {
        const x = cx + (rnd() - 0.5) * size * 2.2, y = cy + (rnd() - 0.5) * size * 0.9, r = size * (0.35 + rnd() * 0.5);
        const grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, 'rgba(255,255,255,0.55)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.22)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        // wrap copies so the tile repeats seamlessly
        for (const [ox, oy] of [[-1024, 0], [1024, 0], [0, -1024], [0, 1024]]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill(); }
      }
    }
  }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas); cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(1.6, 1.6); cloudTex.colorSpace = THREE.SRGBColorSpace;
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.55, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const clouds = new THREE.Mesh(new THREE.CircleGeometry(3200, 48), cloudMat); clouds.rotation.x = -Math.PI / 2; clouds.position.y = 950; clouds.renderOrder = -9; clouds.frustumCulled = false; clouds.userData.noMerge = true;
  scene.add(clouds);

  const S = { hour: 15.5, sunElev: 0, sunAz: 0, sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), daylight: 1, night: 0, sunColor: new THREE.Color(), horizonColor: new THREE.Color(), zenithColor: new THREE.Color(), sunIntensity: 3 };
  const fogColor = new THREE.Color();

  // colour keyframes by sun elevation (deg)
  const keys = [
    // elev, zenith, horizon, sun, ground
    [-18, 0x02040a, 0x070b14, 0x203050, 0x05070a],
    [-8, 0x061020, 0x1a2540, 0x4a4a70, 0x0a0d12],
    [-2, 0x1a2c5a, 0xd96a3c, 0xff7a3c, 0x2a2a30],
    [3, 0x2a5aa8, 0xf0a060, 0xffb070, 0x4a4a48],
    [12, 0x2c6cc0, 0xd9dfe6, 0xfff0d0, 0x55606a],
    [40, 0x2a72d2, 0xbfd7ea, 0xfff4e6, 0x5a6670],
    [90, 0x1e64cc, 0xb4d2ea, 0xfff6ea, 0x5a6670],
  ];
  const cA = new THREE.Color(), cB = new THREE.Color();
  function keyColor(elev, idx, out) {
    let i = 0; while (i < keys.length - 2 && elev > keys[i + 1][0]) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    const t = clamp((elev - k0[0]) / (k1[0] - k0[0]), 0, 1);
    cA.setHex(k0[idx]); cB.setHex(k1[idx]);
    return out.copy(cA).lerp(cB, t);
  }

  function setHour(hour) {
    S.hour = ((hour % 24) + 24) % 24;
    // summer coast day: sun rises in the east (+x) at 05:50, sets in the west (−x) at 19:50 over the ocean
    const ang = ((S.hour - 5.83) / 14) * Math.PI; // 0 at sunrise, π at sunset (negative / > π at night)
    const elev = Math.sin(ang) * 72 * DEG;
    const az = Math.cos(ang); // +1 east → −1 west
    S.sunElev = elev / DEG;
    S.sunDir.set(az * Math.cos(elev), Math.sin(elev), 0.42 * Math.cos(elev) * Math.max(0.2, Math.sin(ang))).normalize();
    if (Math.sin(ang) < 0) S.sunDir.y = Math.sin(elev); // below horizon at night: keep the analytic value
    S.moonDir.copy(S.sunDir).multiplyScalar(-1); S.moonDir.y = Math.abs(S.moonDir.y) * 0.8 + 0.3; S.moonDir.normalize();
    const e = S.sunElev;
    keyColor(e, 1, S.zenithColor); keyColor(e, 2, S.horizonColor); keyColor(e, 3, S.sunColor);
    u.zenith.value.copy(S.zenithColor); u.horizon.value.copy(S.horizonColor); u.sunColor.value.copy(S.sunColor);
    keyColor(e, 4, u.ground.value);
    u.sunDir.value.copy(S.sunDir);
    S.daylight = smoothstep(-6, 8, e);
    S.night = 1 - smoothstep(-14, -3, e);
    u.night.value = S.night;
    u.glow.value = lerp(0.35, 1.2, 1 - smoothstep(5, 40, e)) * smoothstep(-8, 2, e);
    u.sunSize.value = lerp(0.0028, 0.0045, 1 - smoothstep(0, 20, e));
    S.sunIntensity = e < -2 ? 0 : lerp(1.0, 4.6, smoothstep(-2, 35, e));
    fogColor.copy(S.horizonColor);
    if (scene.fog) scene.fog.color.copy(fogColor);
    scene.background = null;
  }
  function update(camera, dt = 0.016) {
    dome.position.copy(camera.position);
    clouds.position.x = camera.position.x; clouds.position.z = camera.position.z;
    cloudTex.offset.x += dt * 0.0012; cloudTex.offset.y += dt * 0.0004;
    cloudMat.color.copy(S.sunColor).lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(0.25 + 0.75 * S.daylight);
    cloudMat.opacity = 0.6 * (0.35 + 0.65 * S.daylight) * (1 - u.night.value * 0.6);
  }
  setHour(S.hour);
  return { S, u, dome, setHour, update, fogColor, refreshEnvironment };
}

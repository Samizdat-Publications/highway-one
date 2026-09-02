// Ocean: Gerstner-ish waves in the vertex shader, depth-tinted colour, Fresnel sky reflection, sun glint,
// rolling foam near the shore (per-vertex water depth baked from the terrain), three.js fog.
import * as THREE from 'three';

const SEA_LEVEL = -1.0;
const vert = `
  uniform float time;
  attribute float depth;
  varying vec3 vWorld; varying vec3 vNormal; varying float vDepth; varying float vFoam;
  #include <fog_pars_vertex>
  void main(){
    vec3 p = position;
    vec2 xz = p.xz;
    // 4 waves heading roughly toward shore (+x), damped in shallow water
    float damp = clamp(depth / 6.0, 0.15, 1.0);
    float h = 0.0; float dhdx = 0.0; float dhdz = 0.0;
    vec4 amps = vec4(0.28, 0.16, 0.10, 0.06) * damp;
    vec4 lens = vec4(34.0, 19.0, 11.0, 6.5);
    vec4 spds = vec4(1.6, 1.25, 1.0, 0.8);
    vec2 dirs[4]; dirs[0] = normalize(vec2(1.0, 0.25)); dirs[1] = normalize(vec2(1.0, -0.3)); dirs[2] = normalize(vec2(0.9, 0.5)); dirs[3] = normalize(vec2(1.0, -0.1));
    for (int i = 0; i < 4; i++) {
      float k = 6.28318 / lens[i];
      float ph = dot(dirs[i], xz) * k + time * spds[i] * k;
      float a = amps[i];
      h += a * sin(ph);
      dhdx += a * k * dirs[i].x * cos(ph);
      dhdz += a * k * dirs[i].y * cos(ph);
    }
    p.y += h;
    vNormal = normalize(vec3(-dhdx, 1.0, -dhdz));
    vDepth = depth;
    // foam rolls toward shore: bands in depth space that move with time
    float band = sin(depth * 1.8 - time * 1.4);
    vFoam = smoothstep(0.1, 0.9, band) * (1.0 - smoothstep(0.0, 3.2, depth)) + (1.0 - smoothstep(0.0, 0.6, depth)) * 0.8;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const frag = `
  uniform vec3 deepColor, shallowColor, skyColor, horizonColor, sunColor, sunDir; uniform float time, glint; uniform sampler2D foamTex;
  varying vec3 vWorld; varying vec3 vNormal; varying float vDepth; varying float vFoam;
  #include <fog_pars_fragment>
  void main(){
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    fres = 0.06 + 0.94 * fres;
    vec3 water = mix(shallowColor, deepColor, smoothstep(0.0, 14.0, vDepth));
    vec3 refl = mix(horizonColor, skyColor, clamp(n.y * 0.6 + 0.2, 0.0, 1.0));
    vec3 col = mix(water, refl, fres * 0.85);
    // sun glint
    vec3 hv = normalize(v + sunDir);
    float spec = pow(max(dot(n, hv), 0.0), 220.0) * glint;
    col += sunColor * spec * 2.5 * step(0.0, sunDir.y);
    // foam
    float ft = texture2D(foamTex, vWorld.xz * 0.06 + vec2(time * 0.02, 0.0)).r;
    float foam = clamp(vFoam * (0.5 + ft), 0.0, 1.0);
    col = mix(col, vec3(0.92, 0.95, 0.96), foam * 0.85);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }`;

export function buildOcean(scene, terrain, sky, T) {
  const W = 1500, D = 4400, sx = 12, sz = 12;
  const nx = Math.round(W / sx), nz = Math.round(D / sz);
  const geo = new THREE.PlaneGeometry(W, D, nx, nz); geo.rotateX(-Math.PI / 2);
  const cx = -100 - W / 2 + 60, cz = -1000; // covers x −1540..−40, z −3200..1200
  const pos = geo.attributes.position;
  const depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    pos.setXYZ(i, x, SEA_LEVEL, z);
    depth[i] = Math.max(-0.5, SEA_LEVEL - terrain.baseHeight(x, z));
  }
  geo.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
  geo.computeBoundingSphere();
  const foamTex = T.canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#404040'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 5, 0, Math.PI * 2); g.fill(); } }, { srgb: false });
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 }, deepColor: { value: new THREE.Color(0x0b3f5c) }, shallowColor: { value: new THREE.Color(0x2d9aa8) },
    skyColor: { value: new THREE.Color(0x2f6fbf) }, horizonColor: { value: new THREE.Color(0xbfd7ea) }, sunColor: { value: new THREE.Color(0xfff2d8) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, glint: { value: 1 }, foamTex: { value: null },
  }]);
  u.foamTex.value = foamTex;
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, fog: true });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = true; mesh.layers.enable(2); mesh.userData.noMerge = true;
  scene.add(mesh);
  function update(dt) {
    u.time.value += dt;
    u.sunDir.value.copy(sky.S.sunDir); u.sunColor.value.copy(sky.S.sunColor);
    u.skyColor.value.copy(sky.u.zenith.value); u.horizonColor.value.copy(sky.u.horizon.value);
    u.glint.value = sky.S.daylight;
    u.deepColor.value.setHex(0x0b3f5c).multiplyScalar(0.25 + 0.75 * sky.S.daylight);
    u.shallowColor.value.setHex(0x2d9aa8).multiplyScalar(0.2 + 0.8 * sky.S.daylight);
    if (scene.fog) { u.fogColor.value.copy(scene.fog.color); u.fogDensity.value = scene.fog.density; }
  }
  return { mesh, update, SEA_LEVEL };
}

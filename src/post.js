import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.045 }, vignette: { value: 0.55 }, desat: { value: 0 }, damage: { value: 0 }, flash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, desat, damage, flash; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 d = uv - 0.5; float r2 = dot(d,d);
      float ca = 0.006 * r2;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d*ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d*ca).b;
      float n = hash(uv * vec2(1920.0,1080.0) + fract(time*13.7)*100.0);
      col += (n - 0.5) * grain * (1.0 - 0.5*smoothstep(0.0,1.0,dot(col,vec3(0.333))));
      col *= 1.0 - vignette * smoothstep(0.12, 0.85, r2 * 2.2);
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(l), desat);
      vec3 dmg = vec3(l) * vec3(1.4,0.22,0.18) + vec3(0.12,0.0,0.0);
      col = mix(col, dmg, damage * smoothstep(0.02, 0.7, r2 * 2.5));
      col += flash;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.45, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const smaa = new SMAAPass();
  composer.addPass(smaa);
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);

  let t = 0;
  return {
    composer, bloom, final,
    setSize(w, h) { composer.setSize(w, h); bloom.setSize(w / 2, h / 2); },
    render(dt) { t += dt; final.uniforms.time.value = t; composer.render(dt); },
    u: final.uniforms,
  };
}

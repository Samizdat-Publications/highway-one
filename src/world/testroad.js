// Phase-1 stand-in world: flat ground, one straight 2-lane road, distance posts. Replaced by roads.js/terrain.js.
import * as THREE from 'three';

export function buildTestWorld(scene, M) {
  const group = new THREE.Group(); scene.add(group);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), M.rep('grass', 300, 300));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; group.add(ground);

  const roadLen = 2400, roadW = 8;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(roadW, roadLen, 1, 1), M.rep('road2', 1, roadLen / 12));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -roadLen / 2 + 300); road.receiveShadow = true; group.add(road);

  // shoulders
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(roadW + 3, roadLen), M.rep('sand', 2, roadLen / 6));
  sh.rotation.x = -Math.PI / 2; sh.position.set(0, -0.01, -roadLen / 2 + 300); sh.receiveShadow = true; group.add(sh);

  // posts every 50 m so speed is readable in screenshots
  const post = new THREE.BoxGeometry(0.12, 1.2, 0.12);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 });
  const posts = new THREE.InstancedMesh(post, postMat, Math.floor(roadLen / 50) * 2);
  const m4 = new THREE.Matrix4(); let i = 0;
  for (let z = 300; z > 300 - roadLen; z -= 50) { for (const x of [-5.2, 5.2]) { m4.makeTranslation(x, 0.6, z); posts.setMatrixAt(i++, m4); } }
  posts.castShadow = true; posts.computeBoundingSphere(); group.add(posts);

  // a few trees for parallax
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, 4, 8), crown = new THREE.SphereGeometry(1.8, 10, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 1 }), crownMat = new THREE.MeshStandardMaterial({ color: 0x3f6a2e, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, 160), crowns = new THREE.InstancedMesh(crown, crownMat, 160);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 160; k++) {
    const x = (rnd() < 0.5 ? -1 : 1) * (12 + rnd() * 60), z = 300 - rnd() * roadLen;
    m4.makeTranslation(x, 2, z); trunks.setMatrixAt(k, m4); m4.makeTranslation(x, 4.6, z); crowns.setMatrixAt(k, m4);
  }
  trunks.castShadow = crowns.castShadow = true; trunks.computeBoundingSphere(); crowns.computeBoundingSphere();
  group.add(trunks, crowns);

  function surfaceAt(x, z) {
    const onRoad = Math.abs(x) <= roadW / 2 && z <= 300 && z >= 300 - roadLen;
    return { height: 0, surface: onRoad ? 'asphalt' : Math.abs(x) < roadW / 2 + 1.5 ? 'sand' : 'grass', onRoad, limitMph: 45, laneIndex: x > 0 ? 1 : -1, lateral: x, tunnel: false };
  }
  return { group, surfaceAt, heightAt: () => 0 };
}

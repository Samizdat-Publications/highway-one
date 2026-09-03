// Cached MeshStandardMaterials built from the texture factory, plus tiling clones via rep().
import * as THREE from 'three';

export function makeMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    // world
    road2: std({ map: T.road2, roughness: 0.92, metalness: 0 }),
    road2dash: std({ map: T.road2dash, roughness: 0.92 }),
    road4: std({ map: T.road4, roughness: 0.92 }),
    street: std({ map: T.street, roughness: 0.92 }),
    asphalt: std({ map: T.asphaltPlain, roughness: 0.93 }),
    pierDeck: std({ map: T.decking, roughness: 0.9 }),
    concrete: std({ map: T.concrete, roughness: 0.88, side: THREE.DoubleSide, color: 0xc4c0b6 }),
    concreteDark: std({ map: T.concrete, roughness: 0.9, color: 0x9a9a9a, side: THREE.DoubleSide }),
    tunnelWall: std({ map: T.concrete, roughness: 0.9, color: 0x8c8880, side: THREE.DoubleSide }),
    railSteel: std({ color: 0xb8bcc0, roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide }),
    paintWhite: std({ color: 0xe8e2c8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    grass: std({ map: T.grass, roughness: 1 }),
    sand: std({ map: T.sand, roughness: 1 }),
    rock: std({ map: T.rock, roughness: 0.95 }),
    // interior
    dashSoft: std({ map: T.plastic, roughnessMap: T.plasticRough, roughness: 1.0, metalness: 0, color: 0xc8c8c8, envMapIntensity: 0.25 }),
    dashDark: std({ color: 0x141518, roughness: 0.9, envMapIntensity: 0.3 }),
    pianoBlack: std({ color: 0x08090b, roughness: 0.12, metalness: 0.1 }),
    trim: std({ map: T.brushed, roughness: 0.38, metalness: 0.85 }),
    chrome: std({ color: 0xf0f2f5, roughness: 0.12, metalness: 1 }),
    leatherTan: std({ map: T.leatherTan, roughness: 0.7, envMapIntensity: 0.4 }),
    seatTan: std({ map: T.stitchTan, roughness: 0.7, envMapIntensity: 0.4 }),
    leatherBlack: std({ map: T.leatherBlack, roughness: 0.65, envMapIntensity: 0.4 }),
    carpet: std({ map: T.carpet, roughness: 1, envMapIntensity: 0.1 }),
    grille: std({ map: T.speakerGrille, roughness: 0.7 }),
    wood: std({ map: T.woodTrim, roughness: 0.25, metalness: 0.05 }),
    rubber: std({ color: 0x0c0c0d, roughness: 0.95, envMapIntensity: 0.2 }),
    headliner: std({ color: 0xb9b3a4, roughness: 1, envMapIntensity: 0.2 }),
    glass: std({ color: 0xcfe3ea, transparent: true, opacity: 0.10, roughness: 0.03, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
    glassTint: std({ color: 0x3a5560, transparent: true, opacity: 0.35, roughness: 0.03, depthWrite: false, side: THREE.DoubleSide }),
    needle: std({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 1.6, roughness: 0.5 }),
    paint: std({ color: 0x9aa7b8, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.4 }),
    paintDark: std({ color: 0x1c2126, roughness: 0.4, metalness: 0.4 }),
    tyre: std({ color: 0x151516, roughness: 0.9 }),
    lensRed: std({ color: 0x5a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.0, roughness: 0.2 }),
    lensAmber: std({ color: 0x6a4008, emissive: 0xffa020, emissiveIntensity: 0.0, roughness: 0.2 }),
    lensWhite: std({ color: 0xd8dde3, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.15, metalness: 0.2 }),
  };

  const cache = new Map();
  // tiling clone of a material's map (and roughnessMap) with the given repeats
  function rep(name, rx, ry) {
    const key = `${name}|${rx}|${ry}`;
    if (cache.has(key)) return cache.get(key);
    const base = M[name];
    const m = base.clone();
    if (base.map) { m.map = base.map.clone(); m.map.repeat.set(rx, ry); m.map.needsUpdate = true; }
    if (base.roughnessMap) { m.roughnessMap = base.roughnessMap.clone(); m.roughnessMap.repeat.set(rx, ry); m.roughnessMap.needsUpdate = true; }
    cache.set(key, m);
    return m;
  }
  M.rep = rep;
  return M;
}

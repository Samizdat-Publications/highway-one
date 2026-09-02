// Seeded xorshift32 RNG. Station clutter, grime, texture noise all come from here so the
// scene is identical every load (screenshots are comparable, bugs are reproducible).
export function createRng(seed = 0x9e3779b9) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  const rng = next;
  rng.range = (a, b) => a + (b - a) * next();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.chance = (p) => next() < p;
  rng.sign = () => (next() < 0.5 ? -1 : 1);
  rng.gauss = () => { // approx normal via 3 uniforms
    return (next() + next() + next() - 1.5) * 1.4;
  };
  return rng;
}

// Non-seeded helpers for gameplay randomness (spread, particles) where determinism doesn't matter.
export const rand = Math.random;
export const rrange = (a, b) => a + (b - a) * Math.random();
export const rint = (a, b) => Math.floor(a + (b - a + 1) * Math.random());

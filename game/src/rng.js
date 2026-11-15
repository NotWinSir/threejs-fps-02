// rng.js — a tiny seeded random source (mulberry32). The simulation never
// calls Math.random: a match is a pure function of its seed, which is what
// lets the screenshot hooks stage the exact same round on every load.

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// range and pick are the two shapes the game code actually wants.
export function rngRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function rngPick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

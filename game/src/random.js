// Deterministic randomness: a small seeded generator plus value noise, so the same seed
// always builds the same coast and the same screenshot scenes.

/** A mulberry32 generator: tiny, fast, good enough for terrain and placement. */
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** Pick one element of an array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}

/** Smoothstep interpolation weight. */
function smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * A 2D value-noise field on a coarse lattice of random values, bilinearly smoothed.
 * sample(x, y) takes lattice coordinates; wrap keeps the world edges calm.
 */
export function createNoise(random, latticeSize) {
  const values = new Float32Array(latticeSize * latticeSize);
  for (let i = 0; i < values.length; i += 1) values[i] = random.next();
  function at(ix, iy) {
    const x = ((ix % latticeSize) + latticeSize) % latticeSize;
    const y = ((iy % latticeSize) + latticeSize) % latticeSize;
    return values[y * latticeSize + x];
  }
  return function sample(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Fractal noise: several octaves of value noise summed, normalised to roughly [0, 1]. */
export function fbm(noise, x, y, octaves) {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o += 1) {
    sum += noise(fx, fy) * amp;
    total += amp;
    fx *= 2.03;
    fy *= 2.03;
    amp *= 0.5;
  }
  return sum / total;
}

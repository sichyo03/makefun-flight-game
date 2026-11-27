// Deterministic randomness: a seeded generator plus value noise, so the same seed
// always builds the same coast, the same course and the same screenshot scenes.
// The generator is sfc32 (four 32-bit state words, seeded from one integer).

/** An sfc32 generator: small, fast, good enough for terrain and placement. */
export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  let b = (a ^ 0x9e3779b9) >>> 0;
  let c = (a * 2654435761) >>> 0;
  let d = (a ^ 0x85ebca6b) >>> 0;
  function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  // Warm up: sfc32 needs a few calls before the state is well mixed.
  for (let i = 0; i < 12; i += 1) next();
  return {
    next,
    /** A float in [min, max). */
    between(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max] inclusive. */
    intBetween(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** Pick one element of an array. */
    choose(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** A shuffled copy of the array (Fisher–Yates). */
    shuffled(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

/** Smootherstep interpolation weight (zero first and second derivative at the ends). */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * A 2D value-noise field on a coarse lattice of random values, smoothly blended.
 * sample(x, y) takes lattice coordinates; the lattice wraps so edges stay calm.
 */
export function makeValueNoise(rng, latticeSize) {
  const grid = new Float32Array(latticeSize * latticeSize);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rng.next();
  function corner(ix, iy) {
    const x = ((ix % latticeSize) + latticeSize) % latticeSize;
    const y = ((iy % latticeSize) + latticeSize) % latticeSize;
    return grid[y * latticeSize + x];
  }
  return function sample(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const tx = fade(x - ix);
    const ty = fade(y - iy);
    const top = corner(ix, iy) + (corner(ix + 1, iy) - corner(ix, iy)) * tx;
    const bottom = corner(ix, iy + 1) + (corner(ix + 1, iy + 1) - corner(ix, iy + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

/** Fractal noise: several octaves of value noise summed, normalised to roughly [0, 1]. */
export function fractalNoise(noise, x, y, octaves) {
  let sum = 0;
  let weight = 0;
  let amp = 1;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o += 1) {
    sum += noise(fx, fy) * amp;
    weight += amp;
    fx = fx * 2.07 + 13.7;
    fy = fy * 2.07 + 7.3;
    amp *= 0.52;
  }
  return sum / weight;
}

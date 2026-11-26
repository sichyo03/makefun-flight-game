// The coast the courier flies over: a heightfield of sea, islands, fields and hills,
// built once from the seed. The runway sits on a flattened apron of coast so take-offs
// and landings have somewhere honest to happen.
import { COLORS, RUNWAY, WORLD } from './config.js';
import { createNoise, fbm } from './random.js';

/** Blend factor that flattens terrain to the runway apron near the strip. */
function runwayBlend(x, z) {
  const dx = Math.abs(x - RUNWAY.x);
  const dz = Math.abs(z - RUNWAY.z);
  const halfW = RUNWAY.width * 2.4;
  const halfL = RUNWAY.length * 0.62;
  const edge = 260;
  const tx = Math.min(1, Math.max(0, (dx - halfW) / edge));
  const tz = Math.min(1, Math.max(0, (dz - halfL) / edge));
  const t = Math.max(tx, tz);
  return t * t * (3 - 2 * t);
}

/**
 * Build the heightfield. Returns heights (raw, may dip below sea level for colouring),
 * a groundHeightAt(x, z) that never goes below the sea surface for collision, and the
 * list of landmark spots (drop-zone island, lighthouse rock) the missions use.
 */
export function createTerrain(random) {
  const { size, grid, maxHeight } = WORLD;
  const cell = size / (grid - 1);
  const half = size / 2;
  const coastNoise = createNoise(random, 64);
  const hillNoise = createNoise(random, 64);
  const heights = new Float32Array(grid * grid);

  for (let gz = 0; gz < grid; gz += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x = -half + gx * cell;
      const z = -half + gz * cell;
      // A mainland massif in the north-east, open sea to the south-west, islands between.
      const nx = (x + half) / size;
      const nz = (z + half) / size;
      const mainland = Math.pow(Math.max(0, (nx * 0.75 + nz * 0.65 - 0.42) / 0.75), 1.6);
      const coast = fbm(coastNoise, nx * 5.2, nz * 5.2, 4);
      const hills = fbm(hillNoise, nx * 11, nz * 11, 4);
      let h = (mainland * 0.85 + (coast - 0.52) * 0.9) * maxHeight;
      h += Math.max(0, h) * hills * 0.85;
      h -= 26; // sink the lowlands so the sea has room
      // A couple of deliberate islands for the cargo run.
      h += island(x, z, 1750, 300, 620, 120);
      h += island(x, z, -2100, 1500, 520, 95);
      h += island(x, z, 600, -2600, 460, 80);
      // Flatten the runway apron.
      const blend = runwayBlend(x, z);
      h = RUNWAY.height + (h - RUNWAY.height) * blend;
      heights[gz * grid + gx] = h;
    }
  }

  function island(x, z, cx, cz, radius, peak) {
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.sqrt(dx * dx + dz * dz) / radius;
    if (d >= 1) return 0;
    const fall = Math.cos(d * Math.PI * 0.5);
    return peak * fall * fall;
  }

  // Flatten a plateau on the big eastern island for the cargo drop zone, so the
  // painted target rings lie on level ground and a crate can come to rest on it.
  const plateau = heightAt(1750, 300);
  for (let gz = 0; gz < grid; gz += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x = -half + gx * cell;
      const z = -half + gz * cell;
      const d = Math.sqrt((x - 1750) ** 2 + (z - 300) ** 2);
      if (d >= 300) continue;
      const t = Math.min(1, Math.max(0, (d - 130) / 170));
      const s = t * t * (3 - 2 * t);
      const idx = gz * grid + gx;
      heights[idx] = plateau + (heights[idx] - plateau) * s;
    }
  }

  /** Bilinear height at a world point (raw; negative under the sea). */
  function heightAt(x, z) {
    const fx = Math.min(grid - 1.001, Math.max(0, (x + half) / cell));
    const fz = Math.min(grid - 1.001, Math.max(0, (z + half) / cell));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = heights[iz * grid + ix];
    const b = heights[iz * grid + ix + 1];
    const c = heights[(iz + 1) * grid + ix];
    const d = heights[(iz + 1) * grid + ix + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  /** The surface a wheel or a belly meets: terrain, but never below the sea. */
  function groundHeightAt(x, z) {
    return Math.max(WORLD.seaLevel, heightAt(x, z));
  }

  /** Is this point on the runway strip (with a small margin)? */
  function onRunway(x, z, margin = 0) {
    return (
      Math.abs(x - RUNWAY.x) <= RUNWAY.width / 2 + margin &&
      Math.abs(z - RUNWAY.z) <= RUNWAY.length / 2 + margin
    );
  }

  return {
    heights,
    cell,
    heightAt,
    groundHeightAt,
    onRunway,
    /** The cargo drop zone: a flat clearing on the big eastern island. */
    dropZone: { x: 1750, z: 300, radius: 90 },
    /** A lighthouse rock off the south coast, scenery only. */
    lighthouse: { x: 620, z: -2620 },
  };
}

/** Flat-shade colour for a terrain height and slope (0 = flat, 1 = cliff). */
export function terrainColor(height, slope) {
  if (height <= -14) return COLORS.deepWater;
  if (height <= -2) return COLORS.water;
  if (height <= 0.6) return COLORS.shallow;
  if (height <= 4) return COLORS.sand;
  if (slope > 0.62) return height > 300 ? COLORS.peak : COLORS.rock;
  if (height <= 26) return COLORS.grassLow;
  if (height <= 90) return COLORS.grass;
  if (height <= 190) return COLORS.forest;
  if (height <= 300) return COLORS.rock;
  return COLORS.peak;
}

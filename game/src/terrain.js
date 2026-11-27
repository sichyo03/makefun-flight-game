// The coast the courier flies over at golden hour: a heightfield of sea, islands,
// fields, a northern mountain range with snow on the tops, and a little harbour town
// beside the strip. Built once from the seed. The runway sits on a flattened apron
// of coast so take-offs and landings have somewhere honest to happen.
import { COLORS, RUNWAY, WORLD } from './config.js';
import { fractalNoise, makeValueNoise } from './rng.js';

/** Blend factor that flattens terrain to the runway apron near the strip. */
function apronBlend(x, z) {
  const dx = Math.abs(x - RUNWAY.x);
  const dz = Math.abs(z - RUNWAY.z);
  const halfW = RUNWAY.width * 2.6;
  const halfL = RUNWAY.length * 0.64;
  const edge = 300;
  const tx = Math.min(1, Math.max(0, (dx - halfW) / edge));
  const tz = Math.min(1, Math.max(0, (dz - halfL) / edge));
  const t = Math.max(tx, tz);
  return t * t * (3 - 2 * t);
}

/** A smooth island bump: peak height at the centre, cosine falloff to the rim. */
function islandBump(x, z, cx, cz, radius, peak) {
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.sqrt(dx * dx + dz * dz) / radius;
  if (d >= 1) return 0;
  const fall = Math.cos(d * Math.PI * 0.5);
  return peak * fall * fall;
}

/**
 * Build the heightfield. Returns heights (raw, may dip below sea level for colouring),
 * a groundHeightAt(x, z) that never goes below the sea surface for collision, and the
 * landmark spots the missions and renderer use: the drop-zone island plateau, the
 * harbour town, the lighthouse rock, and the mountain pass the second leg threads.
 */
export function buildTerrain(rng) {
  const { size, grid, maxHeight } = WORLD;
  const cell = size / (grid - 1);
  const half = size / 2;
  const coastNoise = makeValueNoise(rng, 64);
  const hillNoise = makeValueNoise(rng, 64);
  const ridgeNoise = makeValueNoise(rng, 64);
  const heights = new Float32Array(grid * grid);

  for (let gz = 0; gz < grid; gz += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x = -half + gx * cell;
      const z = -half + gz * cell;
      const nx = (x + half) / size;
      const nz = (z + half) / size;
      // A mainland massif in the north-east, open sea to the south-west, islands between.
      const mainland = Math.pow(Math.max(0, (nx * 0.75 + nz * 0.68 - 0.44) / 0.75), 1.6);
      const coast = fractalNoise(coastNoise, nx * 5.4, nz * 5.4, 4);
      const hills = fractalNoise(hillNoise, nx * 11, nz * 11, 4);
      let h = (mainland * 0.82 + (coast - 0.52) * 0.92) * maxHeight;
      h += Math.max(0, h) * hills * 0.8;
      // The northern range: a ridged band across the top of the map, snow-capped.
      const rangeBand = Math.max(0, (nz - 0.74) / 0.26);
      const ridge = 1 - Math.abs(2 * fractalNoise(ridgeNoise, nx * 7.5, nz * 3.2, 4) - 1);
      h += rangeBand * rangeBand * (140 + ridge * ridge * 230);
      h -= 26; // sink the lowlands so the sea has room
      // Deliberate islands: the big eastern one carries the cargo drop zone.
      h += islandBump(x, z, 1900, 350, 680, 130);
      h += islandBump(x, z, -2250, 1650, 540, 100);
      h += islandBump(x, z, 650, -2750, 480, 82);
      // Flatten the runway apron.
      const blend = apronBlend(x, z);
      h = RUNWAY.height + (h - RUNWAY.height) * blend;
      heights[gz * grid + gx] = h;
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

  // Flatten a plateau on the big eastern island for the cargo drop zone, so the
  // painted target rings lie on level ground and a crate can come to rest on it.
  const plateau = heightAt(1900, 350);
  for (let gz = 0; gz < grid; gz += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x = -half + gx * cell;
      const z = -half + gz * cell;
      const d = Math.sqrt((x - 1900) ** 2 + (z - 350) ** 2);
      if (d >= 320) continue;
      const t = Math.min(1, Math.max(0, (d - 140) / 180));
      const s = t * t * (3 - 2 * t);
      const idx = gz * grid + gx;
      heights[idx] = plateau + (heights[idx] - plateau) * s;
    }
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

  // The harbour town: a scatter of house plots on the flat ground west of the strip,
  // each with a footprint and a roof colour, generated once so the renderer is cheap.
  const houses = [];
  const roofPalette = ['#b5523c', '#8a5a3b', '#5d6e7e', '#a03d2d', '#6e7f52'];
  const wallPalette = ['#f2e8d5', '#e8d9b8', '#dfe6ea', '#f0e0c8'];
  for (let i = 0; i < 46; i += 1) {
    const hx = -260 - rng.between(0, 620);
    const hz = RUNWAY.z + rng.between(-520, 620);
    const hy = heightAt(hx, hz);
    if (hy < 2 || hy > 40) continue; // keep the town on dry, gentle ground
    houses.push({
      x: hx,
      z: hz,
      y: hy,
      w: rng.between(9, 17),
      d: rng.between(9, 15),
      h: rng.between(5, 9),
      rot: rng.between(-0.4, 0.4),
      roof: rng.choose(roofPalette),
      wall: rng.choose(wallPalette),
    });
  }

  return {
    heights,
    cell,
    heightAt,
    groundHeightAt,
    onRunway,
    houses,
    /** The cargo drop zone: a flat clearing on the big eastern island. */
    dropZone: { x: 1900, z: 350, radius: 95 },
    /** A lighthouse rock off the south coast, scenery with a rotating beam. */
    lighthouse: { x: 650, z: -2780 },
    /** The harbour town centre, for the minimap. */
    town: { x: -560, z: RUNWAY.z + 40 },
    /** The windsock beside the touchdown zone: the wind made visible. */
    windsock: { x: RUNWAY.x - RUNWAY.width / 2 - 26, z: RUNWAY.z - RUNWAY.length / 2 + 210 },
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
  if (height <= 95) return COLORS.grass;
  if (height <= 200) return COLORS.forest;
  if (height <= 320) return COLORS.rock;
  return COLORS.peak;
}

// The sortie itself: a twelve-ring course in two legs (the coast, then the mountain
// pass), a cargo drop on the eastern island, then home to the strip. Rings must be
// flown in order and clean rings in a row build a combo multiplier; crates fall
// honestly under gravity and score by where they land; the last landing is graded
// on smoothness. A bomb-sight predicts where a crate dropped now would come down.
import { RUNWAY, SORTIE } from './config.js';

export const EVENT_RING = 1;
export const EVENT_DROP = 2;
export const EVENT_CRATE_DOWN = 4;
export const EVENT_PHASE = 8;

export const PHASE_RINGS = 'rings';
export const PHASE_CARGO = 'cargo';
export const PHASE_RETURN = 'return';
export const PHASE_DONE = 'done';

/**
 * Course waypoints (x, z, height above ground) — leg one tours the coast and the
 * islands, leg two threads the northern range and comes home down the west side.
 */
const COURSE = [
  [180, -820, 130],
  [1150, -200, 170],
  [1950, 700, 150],
  [1050, 1750, 215],
  [150, 2350, 300],
  [-1050, 2750, 360],
  [-2050, 2350, 320],
  [-2350, 1250, 230],
  [-2050, 150, 170],
  [-1750, -850, 150],
  [-950, -1650, 130],
  [-250, -2250, 120],
];

function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Build the ring course for this terrain, each ring facing back down the course. */
export function createMissions(rng, terrain) {
  const rings = [];
  let prev = { x: RUNWAY.x, z: RUNWAY.z + RUNWAY.length / 2 };
  for (let i = 0; i < SORTIE.ringCount; i += 1) {
    const [cx, cz, above] = COURSE[i % COURSE.length];
    const x = cx + rng.between(-110, 110);
    const z = cz + rng.between(-110, 110);
    const y = terrain.groundHeightAt(x, z) + above + rng.between(-22, 22);
    // The ring's normal points along the course so the pilot flies through its face.
    let nx = x - prev.x;
    let nz = z - prev.z;
    const len = Math.max(1, Math.sqrt(nx * nx + nz * nz));
    nx /= len;
    nz /= len;
    rings.push({ x, y, z, nx, nz, radius: SORTIE.ringRadius, passed: false, lastSide: 0, number: i + 1 });
    prev = { x, z };
  }

  return {
    phase: PHASE_RINGS,
    rings,
    ringIndex: 0,
    combo: 0, // clean rings in a row; each one raises the next ring's value
    cratesLeft: SORTIE.crateCount,
    crate: null, // the falling crate, when one is away
    crateResults: [],
    dropZone: terrain.dropZone,
    message: 'Fly through the gold rings in order — clean rings build the combo.',
    messageUntil: 0,
  };
}

function say(missions, text, now, seconds = 4) {
  missions.message = text;
  missions.messageUntil = now + seconds;
}

/** The combo multiplier for the next ring: ×1 plus a step per clean ring, capped. */
export function comboMultiplier(missions) {
  return Math.min(SORTIE.comboMax, 1 + missions.combo * SORTIE.comboStep);
}

/** What the next ring is worth right now, combo included — the HUD shows it. */
export function nextRingValue(missions) {
  return Math.round(SORTIE.ringScore * comboMultiplier(missions));
}

/** The thing the pilot should fly toward next, for the HUD arrow and the minimap. */
export function currentTarget(missions) {
  if (missions.phase === PHASE_RINGS) {
    const ring = missions.rings[missions.ringIndex];
    return ring
      ? { x: ring.x, y: ring.y, z: ring.z, label: `Ring ${ring.number} of ${missions.rings.length}` }
      : null;
  }
  if (missions.phase === PHASE_CARGO) {
    return { x: missions.dropZone.x, y: 0, z: missions.dropZone.z, label: 'Cargo drop zone' };
  }
  if (missions.phase === PHASE_RETURN) {
    return { x: RUNWAY.x, y: RUNWAY.height, z: RUNWAY.z, label: 'Home runway — land to finish' };
  }
  return null;
}

/** Release a crate if the cargo phase has one left. Returns true when a crate went away. */
export function dropCrate(missions, plane, wind, now) {
  if (missions.phase !== PHASE_CARGO || missions.cratesLeft <= 0 || missions.crate || plane.onGround) return false;
  missions.cratesLeft -= 1;
  missions.crate = {
    x: plane.x,
    y: plane.y - 2,
    z: plane.z,
    vx: Math.sin(plane.heading) * plane.speed + wind.vx,
    vy: plane.vy,
    vz: Math.cos(plane.heading) * plane.speed + wind.vz,
    landed: false,
    score: 0,
  };
  say(missions, 'Crate away!', now, 2.5);
  return true;
}

/**
 * Where would a crate dropped right now come down? Simulates the same fall the
 * real crate makes (gravity, canopy cap, drag, wind) without touching the world.
 * The renderer draws this as the bomb-sight cross on the ground.
 */
export function predictCrateLanding(missions, plane, terrain, wind) {
  if (missions.phase !== PHASE_CARGO || missions.cratesLeft <= 0 || missions.crate || plane.onGround) return null;
  let x = plane.x;
  let y = plane.y - 2;
  let z = plane.z;
  let vx = Math.sin(plane.heading) * plane.speed + wind.vx;
  let vy = plane.vy;
  let vz = Math.cos(plane.heading) * plane.speed + wind.vz;
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 40; i += 1) {
    vy -= 9.81 * dt;
    if (vy < -9) vy += (-9 - vy) * Math.min(1, dt * 2.2);
    vx *= 1 - 0.35 * dt;
    vz *= 1 - 0.35 * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    if (y <= terrain.groundHeightAt(x, z) + 1) break;
  }
  const dist = distance2D(x, z, missions.dropZone.x, missions.dropZone.z);
  return { x, z, dist };
}

/**
 * Advance the missions one step against the aeroplane's new position.
 * Returns event flags; score changes are reported through `awards` (points earned now).
 */
export function stepMissions(missions, plane, terrain, wind, dt, now, awards) {
  let events = 0;

  if (missions.phase === PHASE_RINGS) {
    const ring = missions.rings[missions.ringIndex];
    if (ring) {
      const side = (plane.x - ring.x) * ring.nx + (plane.z - ring.z) * ring.nz;
      const distCentre = Math.sqrt((plane.x - ring.x) ** 2 + (plane.y - ring.y) ** 2 + (plane.z - ring.z) ** 2);
      const crossed = ring.lastSide !== 0 && Math.sign(side) !== Math.sign(ring.lastSide);
      if ((crossed && distCentre < ring.radius * 1.15) || distCentre < ring.radius * 0.8) {
        ring.passed = true;
        missions.ringIndex += 1;
        const value = Math.round(SORTIE.ringScore * comboMultiplier(missions));
        awards.points += value;
        missions.combo += 1;
        events |= EVENT_RING;
        if (missions.ringIndex >= missions.rings.length) {
          missions.phase = PHASE_CARGO;
          events |= EVENT_PHASE;
          say(missions, 'Course complete! Deliver the cargo to the island drop zone — the cross marks your fall. Space to drop.', now, 6);
        } else {
          const mult = comboMultiplier(missions);
          say(
            missions,
            mult > 1 ? `Ring ${ring.number} cleared! +${value} — combo ×${mult.toFixed(2)}` : `Ring ${ring.number} cleared! +${value}`,
            now,
            3,
          );
        }
      } else if (crossed && distCentre >= ring.radius * 1.15 && missions.combo > 0) {
        // Flew past the ring's plane wide of it: the combo chain breaks.
        missions.combo = 0;
        say(missions, 'Wide of the ring — combo lost. Circle back through it.', now, 3.5);
      }
      ring.lastSide = side;
    }
  }

  if (missions.crate && !missions.crate.landed) {
    const crate = missions.crate;
    crate.vy -= 9.81 * dt;
    // The little canopy opens and caps the fall at a gentle 9 m/s.
    if (crate.vy < -9) crate.vy += (-9 - crate.vy) * Math.min(1, dt * 2.2);
    crate.vx *= 1 - 0.35 * dt;
    crate.vz *= 1 - 0.35 * dt;
    // The canopy drifts with the wind as it settles.
    crate.vx += (wind.vx - crate.vx) * Math.min(1, dt * 0.25);
    crate.vz += (wind.vz - crate.vz) * Math.min(1, dt * 0.25);
    crate.x += crate.vx * dt;
    crate.y += crate.vy * dt;
    crate.z += crate.vz * dt;
    const ground = terrain.groundHeightAt(crate.x, crate.z);
    if (crate.y <= ground + 1) {
      crate.y = ground + 1;
      crate.landed = true;
      const dist = distance2D(crate.x, crate.z, missions.dropZone.x, missions.dropZone.z);
      const reach = missions.dropZone.radius * 2.4;
      crate.score = Math.max(0, Math.round(SORTIE.crateScore * (1 - dist / reach)));
      missions.crateResults.push({ dist: Math.round(dist), score: crate.score });
      awards.points += crate.score;
      events |= EVENT_CRATE_DOWN;
      const landed = missions.crateResults.length;
      if (missions.cratesLeft <= 0 && landed >= SORTIE.crateCount) {
        missions.phase = PHASE_RETURN;
        events |= EVENT_PHASE;
        say(missions, `Cargo delivered (+${crate.score}). Head home and land on the runway — watch the PAPI lights.`, now, 6);
      } else {
        say(missions, dist < 16 ? `Bullseye! +${crate.score}` : `Crate down, ${Math.round(dist)} m out. +${crate.score}`, now, 4);
      }
      missions.crate = null;
    }
  }

  return events;
}

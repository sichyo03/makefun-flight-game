// The sortie itself: a ring course around the coast, a cargo drop on the eastern
// island, then home to the strip. Rings must be flown in order; crates fall honestly
// under gravity and score by where they land; the last landing is graded on smoothness.
import { RUNWAY, SORTIE } from './config.js';

export const EVENT_RING = 1;
export const EVENT_DROP = 2;
export const EVENT_CRATE_DOWN = 4;
export const EVENT_PHASE = 8;

export const PHASE_RINGS = 'rings';
export const PHASE_CARGO = 'cargo';
export const PHASE_RETURN = 'return';
export const PHASE_DONE = 'done';

/** Course waypoints (x, z, height above ground) — a tour of the whole coast. */
const COURSE = [
  [150, -700, 130],
  [1100, -150, 170],
  [1850, 650, 150],
  [900, 1600, 210],
  [-350, 2100, 180],
  [-1500, 1200, 160],
  [-1900, -100, 140],
  [-700, -1250, 120],
];

function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Build the ring course for this terrain, each ring facing back down the course. */
export function createMissions(random, terrain) {
  const rings = [];
  let prev = { x: RUNWAY.x, z: RUNWAY.z + RUNWAY.length / 2 };
  for (let i = 0; i < SORTIE.ringCount; i += 1) {
    const [cx, cz, above] = COURSE[i % COURSE.length];
    const x = cx + random.range(-120, 120);
    const z = cz + random.range(-120, 120);
    const y = terrain.groundHeightAt(x, z) + above + random.range(-25, 25);
    // The ring's normal points along the course so the pilot flies through its face.
    let nx = x - prev.x;
    let nz = z - prev.z;
    const len = Math.max(1, Math.sqrt(nx * nx + nz * nz));
    nx /= len;
    nz /= len;
    rings.push({ x, y, z, nx, nz, radius: SORTIE.ringRadius, passed: false, lastSide: 0 });
    prev = { x, z };
  }

  return {
    phase: PHASE_RINGS,
    rings,
    ringIndex: 0,
    cratesLeft: SORTIE.crateCount,
    crate: null, // the falling crate, when one is away
    crateResults: [],
    dropZone: terrain.dropZone,
    message: 'Fly through the gold rings in order.',
    messageUntil: 0,
  };
}

function say(missions, text, now, seconds = 4) {
  missions.message = text;
  missions.messageUntil = now + seconds;
}

/** The thing the pilot should fly toward next, for the HUD arrow. */
export function currentTarget(missions) {
  if (missions.phase === PHASE_RINGS) {
    const ring = missions.rings[missions.ringIndex];
    return ring ? { x: ring.x, y: ring.y, z: ring.z, label: `Ring ${missions.ringIndex + 1} of ${missions.rings.length}` } : null;
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
export function dropCrate(missions, plane, now) {
  if (missions.phase !== PHASE_CARGO || missions.cratesLeft <= 0 || missions.crate || plane.onGround) return false;
  missions.cratesLeft -= 1;
  missions.crate = {
    x: plane.x,
    y: plane.y - 2,
    z: plane.z,
    vx: Math.sin(plane.heading) * plane.speed,
    vy: plane.vy,
    vz: Math.cos(plane.heading) * plane.speed,
    landed: false,
    score: 0,
  };
  say(missions, 'Crate away!', now, 2.5);
  return true;
}

/**
 * Advance the missions one step against the aeroplane's new position.
 * Returns event flags; score changes are reported through `awards` (points earned now).
 */
export function stepMissions(missions, plane, terrain, dt, now, awards) {
  let events = 0;

  if (missions.phase === PHASE_RINGS) {
    const ring = missions.rings[missions.ringIndex];
    if (ring) {
      const side = (plane.x - ring.x) * ring.nx + (plane.z - ring.z) * ring.nz;
      const distCentre = Math.sqrt(
        (plane.x - ring.x) ** 2 + (plane.y - ring.y) ** 2 + (plane.z - ring.z) ** 2,
      );
      const crossed = ring.lastSide !== 0 && Math.sign(side) !== Math.sign(ring.lastSide);
      if ((crossed && distCentre < ring.radius * 1.15) || distCentre < ring.radius * 0.8) {
        ring.passed = true;
        missions.ringIndex += 1;
        awards.points += SORTIE.ringScore;
        events |= EVENT_RING;
        if (missions.ringIndex >= missions.rings.length) {
          missions.phase = PHASE_CARGO;
          events |= EVENT_PHASE;
          say(missions, 'Course complete! Deliver the cargo to the island drop zone — press Space to drop.', now, 6);
        } else {
          say(missions, `Ring ${missions.ringIndex} cleared! +${SORTIE.ringScore}`, now, 3);
        }
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
        say(missions, `Cargo delivered (+${crate.score}). Head home and land on the runway.`, now, 6);
      } else {
        say(missions, dist < 16 ? `Bullseye! +${crate.score}` : `Crate down, ${Math.round(dist)} m out. +${crate.score}`, now, 4);
      }
      missions.crate = null;
    }
  }

  return events;
}

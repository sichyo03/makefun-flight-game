// The screenshot scenes behind ?shot=cover|rings|landing|cargo. Each one flies the
// real simulation with a simple autopilot — take off, chase the rings, line up on the
// strip, drop a crate — so the frame is what a short sortie really looks like, and the
// same seed always gives the same frame.
import { PLANE, RUNWAY, STEP } from './config.js';
import { PHASE_CARGO, PHASE_RETURN } from './missions.js';
import { SCREEN_PLAY } from './render.js';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function wrap(angle) {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

function distance3D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

/** Steer toward a point at a chosen speed: bank for heading, pitch for height, throttle for speed. */
function autopilot(world, target, desiredSpeed) {
  const plane = world.plane;
  if (plane.onGround) {
    return {
      pitch: plane.speed > PLANE.takeoffSpeed ? 1 : 0,
      roll: 0,
      throttle: 1,
      brake: false,
      drop: false,
    };
  }
  const desiredHeading = Math.atan2(target.x - plane.x, target.z - plane.z);
  const err = wrap(desiredHeading - plane.heading);
  // Bank toward a target angle, damped, so the wings settle instead of sawing.
  const desiredRoll = clamp(err * 1.3, -0.6, 0.6);
  const roll = clamp((desiredRoll - plane.roll) * 3.5, -1, 1);
  // Aim at the target in 3D: a glidepath straight to the point, gentle from afar.
  const horiz = Math.max(60, Math.hypot(target.x - plane.x, target.z - plane.z));
  const desiredPitch = clamp(Math.atan2(target.y - plane.y, horiz), -0.24, 0.3);
  const pitch = clamp((desiredPitch - plane.pitch) * 3.2, -1, 1);
  const desiredThrottle = clamp(0.5 + (desiredSpeed - plane.speed) * 0.025, 0.05, 1);
  const throttle = clamp((desiredThrottle - plane.throttle) * 4, -1, 1);
  return { pitch, roll, throttle, brake: false, drop: false };
}

function fly(world, seconds, targetFn, speed) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, autopilot(world, targetFn(world), speed), false);
    if (world.state.over) break;
  }
}

/** Fly the ring course until `stop` says the scene is set (or the clock runs out). */
function flyCourse(world, stop, maxSeconds) {
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const ring = world.missions.rings[world.missions.ringIndex];
    const target = ring ?? { x: RUNWAY.x, y: RUNWAY.height + 150, z: RUNWAY.z };
    world.step(STEP, autopilot(world, target, 52), false);
    if (world.state.over || stop(world)) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw. Unknown names give
 * the cover scene: airborne over the coast, first ring ahead, instruments lit.
 */
export function stageShot(name, world) {
  world.reset();
  const { plane, missions, terrain } = world;

  if (name === 'landing') {
    // Skip the sortie: rings flown, cargo away, now on final for the strip.
    missions.rings.forEach((r) => {
      r.passed = true;
    });
    missions.ringIndex = missions.rings.length;
    missions.crateResults.push({ dist: 24, score: 880 }, { dist: 61, score: 640 });
    missions.cratesLeft = 0;
    missions.phase = PHASE_RETURN;
    world.state.started = true;
    world.state.score = 5520;
    world.state.time = 214;
    plane.x = RUNWAY.x + 8;
    plane.z = RUNWAY.z - RUNWAY.length / 2 - 500;
    plane.y = RUNWAY.height + 44;
    plane.heading = 0;
    plane.pitch = -0.07;
    plane.speed = 38;
    plane.throttle = 0.32;
    plane.onGround = false;
    fly(world, 1.8, () => ({ x: RUNWAY.x, y: RUNWAY.height + 6, z: RUNWAY.z - 120 }), 37);
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'cargo') {
    missions.rings.forEach((r) => {
      r.passed = true;
    });
    missions.ringIndex = missions.rings.length;
    missions.phase = PHASE_CARGO;
    world.state.started = true;
    world.state.score = 4000;
    world.state.time = 168;
    const zone = missions.dropZone;
    const gy = terrain.groundHeightAt(zone.x, zone.z);
    plane.x = zone.x - 620;
    plane.z = zone.z - 40;
    plane.y = gy + 98;
    plane.heading = Math.PI / 2; // east, straight at the island
    plane.speed = 46;
    plane.throttle = 0.55;
    plane.onGround = false;
    // Fly to the zone, drop, and stop while the crate is still in frame:
    // it falls behind the aircraft fast, so catch it just below the belly.
    let dropped = false;
    for (let i = 0; i < 30 / STEP; i += 1) {
      const input = autopilot(world, { x: zone.x + 300, y: gy + 98, z: zone.z }, 46);
      if (!dropped && plane.x > zone.x - 240) {
        input.drop = true;
        dropped = true;
      }
      world.step(STEP, input, false);
      if (dropped && missions.crate && missions.crate.y < plane.y - 4.5) break;
      if (world.state.over) break;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'rings') {
    flyCourse(world, (w) => {
      const ring = w.missions.rings[w.missions.ringIndex];
      return w.missions.ringIndex >= 2 && ring && distance3D(w.plane, ring) < 430;
    }, 150);
    return { screen: SCREEN_PLAY, best: 0 };
  }

  // cover (and anything else): airborne, closing on the first ring.
  flyCourse(world, (w) => {
    const ring = w.missions.rings[0];
    return !w.plane.onGround && ring && distance3D(w.plane, ring) < 375;
  }, 90);
  return { screen: SCREEN_PLAY, best: 0 };
}

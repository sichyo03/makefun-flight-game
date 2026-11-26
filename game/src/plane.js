// The aeroplane and how it flies: throttle against drag, pitch against gravity, banked
// turns that cost speed, a stall that drops the nose, and wheels that only forgive a
// gentle arrival on the strip. Arcade-honest: every control answers at every speed,
// but the wing still quits when you ask it to fly too slowly.
import { PLANE, RUNWAY } from './config.js';

export const EVENT_TAKEOFF = 1;
export const EVENT_TOUCHDOWN = 2;
export const EVENT_CRASH = 4;
export const EVENT_STALL = 8;

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(angle) {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

/** A fresh aeroplane parked at the south end of the runway, engine idling. */
export function createPlane() {
  return {
    x: RUNWAY.x,
    y: RUNWAY.height + PLANE.gearHeight,
    z: RUNWAY.z - RUNWAY.length / 2 + 60,
    heading: RUNWAY.heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    vy: 0,
    onGround: true,
    stalled: false,
    propAngle: 0,
    /** Details of the most recent touchdown, for the world's damage and bonus maths. */
    lastTouchdown: { vSpeed: 0, onRunway: false, aligned: false, speed: 0 },
    crashed: false,
    crashReason: '',
  };
}

/** Put the aeroplane back on the runway, whole and fuelled (fuel itself lives in the world). */
export function resetPlane(plane) {
  Object.assign(plane, createPlane());
}

/** The unit vector the nose points along, pitch included. */
export function forwardVector(plane) {
  const cp = Math.cos(plane.pitch);
  return {
    x: Math.sin(plane.heading) * cp,
    y: Math.sin(plane.pitch),
    z: Math.cos(plane.heading) * cp,
  };
}

/** Heading in degrees, 0 = north, clockwise — the number the compass shows. */
export function headingDegrees(plane) {
  const deg = (plane.heading * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/**
 * Advance the aeroplane one step. `input` is { pitch, roll, throttle, brake } with
 * pitch/roll/throttle in -1..1 (pitch +1 = nose up, roll +1 = bank right,
 * throttle +1 = open up). `terrain` provides groundHeightAt/onRunway. Returns event flags.
 */
export function stepPlane(plane, input, terrain, dt) {
  if (plane.crashed) return 0;
  let events = 0;

  // --- Controls -------------------------------------------------------------
  plane.throttle = clamp(plane.throttle + input.throttle * dt * 0.85, 0, 1);

  const wasStalled = plane.stalled;
  plane.stalled = !plane.onGround && plane.speed < PLANE.stallSpeed;
  if (plane.stalled && !wasStalled) events |= EVENT_STALL;
  const authority = plane.stalled ? 0.45 : 1; // mushy controls in the stall

  const pitchTarget = plane.stalled ? -0.34 : clamp(plane.pitch + input.pitch * dt * PLANE.pitchRate * authority, PLANE.pitchMin, PLANE.pitchMax);
  plane.pitch += clamp(pitchTarget - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  if (plane.onGround) plane.pitch = clamp(plane.pitch, 0, PLANE.pitchMax);

  if (input.roll !== 0) {
    plane.roll = clamp(plane.roll + input.roll * dt * PLANE.rollRate * authority, -PLANE.rollMax, PLANE.rollMax);
  } else {
    // Dihedral: the wings wander back toward level on their own.
    const settle = 0.9 * dt;
    plane.roll = Math.abs(plane.roll) <= settle ? 0 : plane.roll - Math.sign(plane.roll) * settle;
  }
  if (plane.onGround) plane.roll = clamp(plane.roll, -0.08, 0.08);

  // --- Speed: engine, drag, gravity along the flight path -------------------
  let accel = plane.throttle * PLANE.engineAccel - PLANE.dragK * plane.speed * plane.speed;
  accel -= PLANE.gravity * Math.sin(plane.pitch) * 0.92;
  if (plane.onGround) {
    accel -= PLANE.groundFriction * Math.sign(plane.speed);
    if (input.brake) accel -= PLANE.brakeDecel * Math.sign(plane.speed);
  }
  plane.speed = Math.max(0, plane.speed + accel * dt);

  // --- Turning: bank makes the turn, speed sets its rate --------------------
  if (!plane.onGround) {
    const turnRate = clamp((PLANE.gravity * Math.tan(plane.roll)) / Math.max(plane.speed, 9), -0.85, 0.85);
    plane.heading = wrapAngle(plane.heading + turnRate * dt);
  } else if (plane.speed > 2) {
    // Nose-wheel steering while rolling.
    plane.heading = wrapAngle(plane.heading + input.roll * 0.5 * dt * Math.min(1, plane.speed / 12));
  }

  // --- Vertical: the wing carries you only while it has speed ---------------
  let vy = Math.sin(plane.pitch) * plane.speed;
  if (plane.stalled) vy -= (PLANE.stallSpeed - plane.speed) * 0.62 + 2.2;
  plane.vy = vy;

  const fwd = forwardVector(plane);
  plane.x += fwd.x * plane.speed * dt;
  plane.z += fwd.z * plane.speed * dt;
  plane.y += vy * dt;
  plane.propAngle = (plane.propAngle + dt * (4 + plane.throttle * 46)) % TAU;

  // --- Ground ---------------------------------------------------------------
  const ground = terrain.groundHeightAt(plane.x, plane.z);
  const wheelY = plane.y - PLANE.gearHeight;
  if (plane.onGround) {
    plane.y = ground + PLANE.gearHeight;
    plane.vy = 0;
    if (plane.speed >= PLANE.takeoffSpeed && plane.pitch > 0.05) {
      plane.onGround = false;
      events |= EVENT_TAKEOFF;
    }
  } else if (wheelY <= ground) {
    const onStrip = terrain.onRunway(plane.x, plane.z, 6);
    // The flattened apron beside the strip forgives a gentle arrival — roughly.
    const onApron = !onStrip && terrain.onRunway(plane.x, plane.z, 48) && Math.abs(ground - RUNWAY.height) < 2.5;
    const aligned = Math.abs(wrapAngle(plane.heading - RUNWAY.heading)) < 0.35 || Math.abs(wrapAngle(plane.heading - RUNWAY.heading - Math.PI)) < 0.35;
    plane.lastTouchdown = { vSpeed: -vy, onRunway: onStrip, rough: onApron, aligned, speed: plane.speed };
    if ((onStrip || onApron) && aligned && -vy < 13 && Math.abs(plane.roll) < 0.3) {
      plane.onGround = true;
      plane.y = ground + PLANE.gearHeight;
      plane.pitch = 0;
      plane.roll = 0;
      plane.vy = 0;
      events |= EVENT_TOUCHDOWN;
    } else {
      plane.crashed = true;
      plane.crashReason = !onStrip
        ? ground <= 0.01
          ? 'You ditched in the sea.'
          : 'You struck the terrain.'
        : 'The arrival was too hard for the gear.';
      plane.y = ground + PLANE.gearHeight * 0.5;
      events |= EVENT_CRASH;
    }
  }

  return events;
}

/** Altitude above the ground directly below, in metres — what the altimeter should show. */
export function altitudeAboveGround(plane, terrain) {
  return Math.max(0, plane.y - PLANE.gearHeight - terrain.groundHeightAt(plane.x, plane.z));
}

// The world of one sortie: the aeroplane, the coast, the missions, and the two gauges
// (fuel and hull) that make every decision cost something. The world owns the score,
// the clock, and the moment the sortie ends — in triumph on the strip, or in the sea.
import { PLANE, RUNWAY, SORTIE, SUPPLY } from './config.js';
import { createTerrain } from './terrain.js';
import { createPlane, resetPlane, stepPlane, EVENT_CRASH, EVENT_STALL, EVENT_TAKEOFF, EVENT_TOUCHDOWN } from './plane.js';
import { createMissions, currentTarget, dropCrate, stepMissions, PHASE_RETURN } from './missions.js';

export const EVENT_OVER = 1;
export const EVENT_DONE = 2;
export const EVENT_REFUEL = 4;
export const EVENT_HURT = 8;

const MAX_PARTICLES = 260;

function spawnBurst(world, x, y, z, kind, count, spread, life) {
  for (let i = 0; i < count && world.particles.length < MAX_PARTICLES; i += 1) {
    const a = world.random.next() * Math.PI * 2;
    const r = world.random.next() * spread;
    world.particles.push({
      x,
      y,
      z,
      vx: Math.cos(a) * r,
      vy: world.random.range(1, 6),
      vz: Math.sin(a) * r,
      life: life * world.random.range(0.6, 1.2),
      maxLife: life,
      kind,
    });
  }
}

/** A fresh world: coast built, aeroplane parked, sortie briefed. */
export function createWorld(random) {
  const terrain = createTerrain(random);
  const clouds = [];
  for (let i = 0; i < 42; i += 1) {
    clouds.push({
      x: random.range(-3200, 3200),
      y: random.range(330, 500),
      z: random.range(-3200, 3200),
      r: random.range(85, 210),
    });
  }
  const world = {
    random,
    terrain,
    plane: createPlane(),
    missions: createMissions(random, terrain),
    clouds,
    particles: [],
    state: null,
    reset() {
      resetPlane(world.plane);
      world.missions = createMissions(random, terrain);
      world.particles.length = 0;
      world.state = {
        fuel: SUPPLY.fuelMax,
        hull: SUPPLY.hullMax,
        score: 0,
        time: 0,
        started: false,
        over: false,
        success: false,
        overReason: '',
        landingBonus: 0,
        timeBonus: 0,
        refuelling: false,
        smokeTimer: 0,
      };
    },
    step(dt, input, attract) {
      return stepWorld(world, dt, input, attract);
    },
  };
  world.reset();
  return world;
}

function endSortie(world, success, reason) {
  const state = world.state;
  state.over = true;
  state.success = success;
  state.overReason = reason;
  if (success) {
    state.timeBonus = Math.max(0, Math.round((SORTIE.parTime - state.time) * SORTIE.ringTimeBonus));
    state.score += state.timeBonus;
  }
}

function stepWorld(world, dt, input, attract) {
  const { plane, terrain, missions, state } = world;
  let events = 0;
  if (state.over) return events;

  // Title-screen attract mode: the aeroplane sits on the strip, engine ticking over.
  const controls = attract ? { pitch: 0, roll: 0, throttle: 0, brake: true, drop: false } : input;

  // Fuel: the engine drinks in proportion to the throttle lever.
  if (state.started && plane.throttle > 0.01) {
    const burn = SUPPLY.fuelIdleBurn + (SUPPLY.fuelFullBurn - SUPPLY.fuelIdleBurn) * plane.throttle;
    state.fuel = Math.max(0, state.fuel - burn * dt);
  }
  const engineOut = state.fuel <= 0;
  const effective = engineOut ? { ...controls, throttle: -1 } : controls;

  const planeEvents = stepPlane(plane, effective, terrain, dt);

  if (planeEvents & EVENT_TAKEOFF) {
    state.started = true;
    missions.message = 'Airborne! Climb out and turn toward the first ring.';
    missions.messageUntil = state.time + 4;
  }
  if (planeEvents & EVENT_STALL) {
    missions.message = 'STALL — nose down, let the speed build!';
    missions.messageUntil = state.time + 3;
  }
  if (planeEvents & EVENT_TOUCHDOWN) {
    const { vSpeed, rough, onRunway } = plane.lastTouchdown;
    spawnBurst(world, plane.x, plane.y, plane.z, 'dust', 14, 6, 1.1);
    if (rough) {
      const damage = Math.round(9 + vSpeed * 2);
      state.hull -= damage;
      events |= EVENT_HURT;
      missions.message = `Rough field landing beside the strip! Hull −${damage}. The strip itself pays the bonus.`;
      missions.messageUntil = state.time + 5;
      if (state.hull <= 0) {
        plane.crashed = true;
        plane.crashReason = 'The gear gave up on the rough ground.';
      }
    } else if (vSpeed > SUPPLY.hardLandingVSpeed) {
      const damage = Math.round((vSpeed - SUPPLY.hardLandingVSpeed) * 10);
      state.hull -= damage;
      events |= EVENT_HURT;
      missions.message = `Hard landing! Hull −${damage}.`;
      missions.messageUntil = state.time + 4;
      if (state.hull <= 0) {
        plane.crashed = true;
        plane.crashReason = 'The gear collapsed under the arrival.';
      }
    }
    if (!plane.crashed && missions.phase === PHASE_RETURN && onRunway) {
      const smoothness = Math.max(0, 1 - vSpeed / SUPPLY.crashVSpeed);
      state.landingBonus = Math.round(SORTIE.landingScore * smoothness);
      state.score += state.landingBonus;
      missions.phase = 'done';
      endSortie(world, true, 'Sortie complete — cargo delivered and home safe.');
      events |= EVENT_DONE | EVENT_OVER;
      return events;
    }
  }
  if (planeEvents & EVENT_CRASH || plane.crashed) {
    const inWater = terrain.heightAt(plane.x, plane.z) <= 0.5;
    spawnBurst(world, plane.x, plane.y + 2, plane.z, inWater ? 'splash' : 'fire', 42, 14, 1.8);
    endSortie(world, false, plane.crashReason || 'The sortie ended early.');
    events |= EVENT_OVER;
    return events;
  }

  // Refuelling: stopped on the strip, the bowser finds you.
  state.refuelling = plane.onGround && plane.speed < 1 && terrain.onRunway(plane.x, plane.z, 10) && state.fuel < SUPPLY.fuelMax;
  if (state.refuelling) {
    const before = state.fuel;
    state.fuel = Math.min(SUPPLY.fuelMax, state.fuel + 26 * dt);
    if (before < SUPPLY.fuelMax && state.fuel >= SUPPLY.fuelMax) events |= EVENT_REFUEL;
  }

  // Missions and the crate.
  if (controls.drop && dropCrate(missions, plane, state.time)) events |= 16;
  const awards = { points: 0 };
  const missionEvents = stepMissions(missions, plane, terrain, dt, state.time, awards);
  state.score += awards.points;
  if (missionEvents & 1) {
    const ring = missions.rings[missions.ringIndex - 1];
    if (ring) spawnBurst(world, ring.x, ring.y, ring.z, 'spark', 22, 10, 0.9);
  }
  events |= missionEvents << 8;

  // Smoke when the hull is hurt; the clock once airborne.
  if (state.hull < 45 && !plane.onGround) {
    state.smokeTimer -= dt;
    if (state.smokeTimer <= 0) {
      state.smokeTimer = 0.08;
      spawnBurst(world, plane.x, plane.y, plane.z, 'smoke', 1, 1.2, 1.6);
    }
  }
  if (state.started) state.time += dt;

  // Particles drift and fade.
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const p = world.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      world.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.kind === 'fire' || p.kind === 'splash') p.vy -= 7 * dt;
    if (p.kind === 'smoke') p.vy += 2.2 * dt;
  }

  return events;
}

export { currentTarget };

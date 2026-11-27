// The world of one sortie: the aeroplane, the coast, the missions, the wind, and the
// two gauges (fuel and hull) that make every decision cost something. The world owns
// the score, the clock, the living scenery (boats under way, birds, clouds on the
// wind), the score popups, and the moment the sortie ends — in triumph on the strip,
// or in the sea.
import { PLANE, RUNWAY, SORTIE, SUPPLY } from './config.js';
import { buildTerrain } from './terrain.js';
import {
  createPlane,
  resetPlane,
  stepPlane,
  windAt,
  EVENT_CRASH,
  EVENT_STALL,
  EVENT_TAKEOFF,
  EVENT_TOUCHDOWN,
} from './plane.js';
import { createMissions, currentTarget, dropCrate, predictCrateLanding, stepMissions, PHASE_RETURN } from './missions.js';

export const EVENT_OVER = 1;
export const EVENT_DONE = 2;
export const EVENT_REFUEL = 4;
export const EVENT_HURT = 8;
export const EVENT_DROP = 16;

const MAX_PARTICLES = 320;
const MAX_POPUPS = 8;

function spawnBurst(world, x, y, z, kind, count, spread, life) {
  for (let i = 0; i < count && world.particles.length < MAX_PARTICLES; i += 1) {
    const a = world.rng.next() * Math.PI * 2;
    const r = world.rng.next() * spread;
    world.particles.push({
      x,
      y,
      z,
      vx: Math.cos(a) * r,
      vy: world.rng.between(1, 6),
      vz: Math.sin(a) * r,
      life: life * world.rng.between(0.6, 1.2),
      maxLife: life,
      kind,
    });
  }
}

/** A floating "+500" that rises and fades where the points were earned. */
function spawnPopup(world, x, y, z, text, color) {
  world.popups.push({ x, y, z, text, color, life: 1.6, maxLife: 1.6 });
  if (world.popups.length > MAX_POPUPS) world.popups.shift();
}

/** A fresh world: coast built, aeroplane parked, sortie briefed, scenery alive. */
export function createWorld(rng) {
  const terrain = buildTerrain(rng);
  const clouds = [];
  for (let i = 0; i < 48; i += 1) {
    clouds.push({
      x: rng.between(-3400, 3400),
      y: rng.between(330, 520),
      z: rng.between(-3400, 3400),
      r: rng.between(85, 220),
    });
  }
  // Fishing boats working the south-western water, each on its own slow circuit.
  const boats = [];
  for (let i = 0; i < 7; i += 1) {
    boats.push({
      cx: rng.between(-2600, 900),
      cz: rng.between(-2900, -700),
      radius: rng.between(220, 520),
      phase: rng.between(0, Math.PI * 2),
      speed: rng.between(0.008, 0.02) * (rng.chance(0.5) ? 1 : -1),
      hue: rng.choose(['#e8641e', '#2e86c9', '#f2e8d5', '#c9403d']),
    });
  }
  // Gulls wheeling over the harbour and the drop island.
  const birds = [];
  for (let i = 0; i < 14; i += 1) {
    const nearTown = i < 8;
    birds.push({
      cx: nearTown ? terrain.town.x + rng.between(-160, 160) : terrain.dropZone.x + rng.between(-200, 200),
      cz: nearTown ? terrain.town.z + rng.between(-160, 160) : terrain.dropZone.z + rng.between(-200, 200),
      cy: rng.between(60, 140),
      radius: rng.between(40, 130),
      phase: rng.between(0, Math.PI * 2),
      speed: rng.between(0.25, 0.55) * (rng.chance(0.5) ? 1 : -1),
      flap: rng.between(0, Math.PI * 2),
    });
  }

  const world = {
    rng,
    terrain,
    plane: createPlane(),
    missions: createMissions(rng, terrain),
    clouds,
    boats,
    birds,
    particles: [],
    popups: [],
    wind: windAt(0),
    state: null,
    reset() {
      resetPlane(world.plane);
      world.missions = createMissions(rng, terrain);
      world.particles.length = 0;
      world.popups.length = 0;
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
        trailTimer: 0,
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
    state.timeBonus = Math.max(0, Math.round((SORTIE.parTime - state.time) * SORTIE.timeBonusPerSec));
    state.score += state.timeBonus;
  }
}

function stepWorld(world, dt, input, attract) {
  const { plane, terrain, missions, state } = world;
  let events = 0;
  if (state.over) return events;

  world.wind = windAt(state.time);

  // Title-screen attract mode: the aeroplane sits on the strip, engine ticking over.
  const controls = attract ? { pitch: 0, roll: 0, throttle: 0, brake: true, drop: false, flaps: false } : input;

  // Fuel: the engine drinks in proportion to the throttle lever.
  if (state.started && plane.throttle > 0.01) {
    const burn = SUPPLY.fuelIdleBurn + (SUPPLY.fuelFullBurn - SUPPLY.fuelIdleBurn) * plane.throttle;
    state.fuel = Math.max(0, state.fuel - burn * dt);
  }
  const engineOut = state.fuel <= 0;
  const effective = engineOut ? { ...controls, throttle: -1 } : controls;

  const planeEvents = stepPlane(plane, effective, terrain, world.wind, dt);

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
  state.refuelling =
    plane.onGround && plane.speed < 1 && terrain.onRunway(plane.x, plane.z, 10) && state.fuel < SUPPLY.fuelMax;
  if (state.refuelling) {
    const before = state.fuel;
    state.fuel = Math.min(SUPPLY.fuelMax, state.fuel + 26 * dt);
    if (before < SUPPLY.fuelMax && state.fuel >= SUPPLY.fuelMax) events |= EVENT_REFUEL;
  }

  // Missions and the crate.
  if (controls.drop && dropCrate(missions, plane, world.wind, state.time)) events |= EVENT_DROP;
  const awards = { points: 0 };
  const missionEvents = stepMissions(missions, plane, terrain, world.wind, dt, state.time, awards);
  state.score += awards.points;
  if (missionEvents & 1) {
    const ring = missions.rings[missions.ringIndex - 1];
    if (ring) {
      spawnBurst(world, ring.x, ring.y, ring.z, 'spark', 24, 10, 0.9);
      spawnPopup(world, ring.x, ring.y + 12, ring.z, `+${awards.points}`, '#ffd23e');
      // Combo milestones get their own shout: ×2 at four clean rings, ×3 at eight.
      if (missions.combo === 4 || missions.combo === 8) {
        spawnPopup(world, ring.x, ring.y + 26, ring.z, `COMBO ×${missions.combo === 4 ? '2.00' : '3.00'}`, '#ff7a3e');
      }
    }
  }
  if (missionEvents & 4 && awards.points > 0) {
    spawnPopup(world, plane.x, plane.y + 14, plane.z, `+${awards.points}`, '#57e389');
  }
  events |= missionEvents << 8;

  // Smoke when the hull is hurt; wingtip vapour when the wing is working hard.
  if (state.hull < 45 && !plane.onGround) {
    state.smokeTimer -= dt;
    if (state.smokeTimer <= 0) {
      state.smokeTimer = 0.08;
      spawnBurst(world, plane.x, plane.y, plane.z, 'smoke', 1, 1.2, 1.6);
    }
  }
  if (!plane.onGround && Math.abs(plane.roll) > 0.55 && plane.speed > 34) {
    state.trailTimer -= dt;
    if (state.trailTimer <= 0) {
      state.trailTimer = 0.05;
      const fwdX = Math.sin(plane.heading);
      const fwdZ = Math.cos(plane.heading);
      const sideX = fwdZ;
      const sideZ = -fwdX;
      for (const s of [-1, 1]) {
        world.particles.push({
          x: plane.x + sideX * 7.5 * s,
          y: plane.y - 0.5,
          z: plane.z + sideZ * 7.5 * s,
          vx: -fwdX * 3,
          vy: -0.4,
          vz: -fwdZ * 3,
          life: 0.7,
          maxLife: 0.7,
          kind: 'vapour',
        });
      }
    }
  }
  if (state.started) state.time += dt;

  // Living scenery: clouds ride the wind, boats work their circuits, gulls wheel.
  for (const cloud of world.clouds) {
    cloud.x += world.wind.vx * dt * 0.55;
    cloud.z += world.wind.vz * dt * 0.55;
    if (cloud.x > 3600) cloud.x -= 7200;
    if (cloud.x < -3600) cloud.x += 7200;
    if (cloud.z > 3600) cloud.z -= 7200;
    if (cloud.z < -3600) cloud.z += 7200;
  }
  for (const boat of world.boats) boat.phase += boat.speed * dt;
  for (const bird of world.birds) {
    bird.phase += bird.speed * dt;
    bird.flap += dt * 9;
  }

  // Particles drift and fade; popups rise.
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
  for (let i = world.popups.length - 1; i >= 0; i -= 1) {
    const p = world.popups[i];
    p.life -= dt;
    p.y += dt * 7;
    if (p.life <= 0) world.popups.splice(i, 1);
  }

  return events;
}

export { currentTarget, predictCrateLanding };

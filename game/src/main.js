// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, the renderer paints what is there, and the engine note follows the throttle.
// Screens: title, play, paused, and the end-of-sortie summary.
//
// ?seed=N fixes the coast and the course. ?shot=cover|rings|landing|cargo (with &seed=N)
// stages that scene with an autopilot instead of running the loop, paints it until the
// camera settles, and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_DONE, EVENT_OVER, EVENT_REFUEL } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

// Mission events arrive shifted out of the world's low bits (see world.js).
const MISSION_RING = 1 << 8;
const MISSION_CRATE_DOWN = 4 << 8;
const WORLD_DROP = 16;

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best, STEP);
    painted += 1;
    if (painted < 45) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let wasOnGround = true;
  let wasCrashed = false;

  function announce(message) {
    status.textContent = message;
  }

  function startSortie() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    wasOnGround = true;
    wasCrashed = false;
    audio.wake();
    announce('Sortie started. Throttle up with W, lift off with the up arrow.');
  }

  function endSortie() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(world.state.success ? `Sortie complete. Score ${world.state.score}.` : `Sortie over. ${world.state.overReason} Score ${world.state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startSortie();
    else if (actions & ACTION_RESTART && screen === SCREEN_OVER) startSortie();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    const controls = screen === SCREEN_TITLE ? { pitch: 0, roll: 0, throttle: 0, brake: true, drop: false } : input.read();
    const events = world.step(STEP, controls, screen === SCREEN_TITLE);
    const plane = world.plane;

    // Sounds, from the world's events and the aeroplane's own edges.
    if (events & MISSION_RING) audio.ring();
    if (events & WORLD_DROP) audio.drop();
    if (events & MISSION_CRATE_DOWN) {
      const last = world.missions.crateResults[world.missions.crateResults.length - 1];
      audio.crateDown(last && last.score >= 500);
    }
    if (events & EVENT_REFUEL) audio.refuelled();
    if (wasOnGround === false && plane.onGround) audio.touchdown(plane.lastTouchdown.vSpeed > 5.5);
    if (!wasCrashed && plane.crashed) audio.crash();
    if (events & EVENT_DONE) audio.success();
    wasOnGround = plane.onGround;
    wasCrashed = plane.crashed;

    if (events & EVENT_OVER) endSortie();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.update(world.plane, screen === SCREEN_PLAY);
    renderer.draw(world, screen, best, STEP);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.wake(), { once: true });
  window.addEventListener('keydown', () => audio.wake(), { once: true });

  announce('Sky Courier. Press Space to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

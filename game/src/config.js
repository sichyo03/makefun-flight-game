// Sky Courier "Golden Hour Run" — every tuning number in one place.
// Units are metres, seconds and radians inside the simulation; the HUD converts to
// the feet, knots and degrees a pilot reads.

/** Fixed simulation step (seconds). The world always advances in these slices. */
export const STEP = 1 / 60;

/** localStorage key for the best sortie score. */
export const BEST_KEY = 'sky-courier-golden-best';

/** The world: a square of coast, 6.8 km a side, sampled on a 108×108 height grid. */
export const WORLD = {
  size: 6800,
  grid: 108,
  seaLevel: 0,
  maxHeight: 340,
};

/** The home runway: a flat strip on the south coast, running north (+z). */
export const RUNWAY = {
  x: 0,
  z: -1750,
  length: 960,
  width: 48,
  height: 9,
  heading: 0, // radians; 0 = north (+z)
};

/** The aeroplane: a sturdy little high-wing courier with flaps. Speeds in m/s. */
export const PLANE = {
  maxSpeed: 92, // ~179 kt
  stallSpeed: 23, // ~45 kt clean; flaps lower it
  stallSpeedFlaps: 17.5, // ~34 kt with flaps down
  takeoffSpeed: 30,
  engineAccel: 11,
  dragK: 0.00128, // quadratic drag: accel -= dragK * v^2
  flapDrag: 0.9, // extra decel (m/s²) with flaps down
  pitchRate: 0.88,
  pitchMin: -0.62, // -35°
  pitchMax: 0.55, // +31°
  rollRate: 1.75,
  rollMax: 0.98, // 56° of bank
  gravity: 9.81,
  groundFriction: 0.55, // m/s² of rolling drag on the strip
  brakeDecel: 6.5,
  gearHeight: 1.6, // fuselage centre above the wheels' contact patch
};

/** Wind: a steady sea breeze with slow gusts. Direction is where it blows TOWARD. */
export const WIND = {
  baseSpeed: 6.5, // m/s (~13 kt)
  gustAmp: 2.6, // extra m/s at the gust peak
  gustPeriod: 17, // seconds per gust cycle
  dirBase: 2.25, // radians: from the south-west, blowing toward the north-east
  dirSwing: 0.22, // slow veer amplitude (radians)
  dirPeriod: 47, // seconds per veer cycle
};

/** Fuel and hull: the two gauges that turn a sortie into decisions. */
export const SUPPLY = {
  fuelMax: 280, // a careful cruise finishes with margin; flat-out still forces a stop
  fuelIdleBurn: 0.12, // per second at closed throttle
  fuelFullBurn: 0.92, // per second at full throttle
  hullMax: 100,
  hardLandingVSpeed: 5.5, // m/s of descent at touchdown before the gear complains
  crashVSpeed: 13,
};

/** The sortie: twelve rings in two legs, then cargo, then home. */
export const SORTIE = {
  ringCount: 12,
  ringRadius: 30,
  ringScore: 500,
  comboStep: 0.25, // each clean ring in a row adds +25% to the next ring's value
  comboMax: 3, // multiplier cap (×3.0 at nine clean rings)
  crateCount: 2,
  crateScore: 1000,
  landingScore: 1000,
  parTime: 380, // seconds; finish faster for the time bonus
  timeBonusPerSec: 12,
};

/** Camera and view. */
export const CAMERA = {
  back: 27, // metres behind the aeroplane
  up: 7.5, // metres above it
  ahead: 70, // look-at point this far in front
  fov: 1.08, // radians, vertical-ish field of view factor
  far: 4600, // terrain beyond this is haze, not drawn
  near: 1.2,
};

/** Palette: one golden-hour style — low sun, warm light, long shadows in the sky. */
export const COLORS = {
  skyTop: '#2e4a73',
  skyMid: '#7d8fc4',
  skyLow: '#f2b880',
  skyHorizon: '#ffd9a0',
  haze: '#f7cf9e',
  sun: '#ffe9b0',
  sunGlow: 'rgba(255, 196, 110, 0.55)',
  cloud: '#fff4e0',
  cloudShade: '#e8b48c',
  deepWater: '#17517f',
  water: '#2a76a8',
  shallow: '#57a8c9',
  waterGlint: '#ffd9a0',
  sand: '#f0d69a',
  grassLow: '#9cc45e',
  grass: '#6aa84c',
  forest: '#3f7a3c',
  rock: '#8a7f74',
  peak: '#f2ece2',
  asphalt: '#3c4048',
  runwayPaint: '#f4f4f4',
  ringNext: '#ffd23e',
  ringIdle: '#2ee6c8',
  ringDone: '#9fb7c9',
  beacon: '#ff7a3e',
  planeBody: '#f6f1e3',
  planeTrim: '#e8641e',
  planeDark: '#2b2f36',
  navRed: '#ff4a3e',
  navGreen: '#3eff7a',
  hudInk: '#10202e',
  hudPanel: 'rgba(10, 26, 40, 0.62)',
  hudLine: 'rgba(160, 220, 255, 0.85)',
  hudText: '#eaf6ff',
  hudWarn: '#ff5a4e',
  hudGood: '#57e389',
};

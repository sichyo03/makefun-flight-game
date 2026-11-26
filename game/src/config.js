// Sky Courier — every tuning number in one place: the world, the aeroplane, the sortie.
// Units are metres, seconds and radians inside the simulation; the HUD converts to the
// feet, knots and degrees a pilot reads.

/** Fixed simulation step (seconds). The world always advances in these slices. */
export const STEP = 1 / 60;

/** localStorage key for the best sortie score. */
export const BEST_KEY = 'sky-courier-best';

/** The world: a square of coast, 6.4 km a side, sampled on a 100×100 height grid. */
export const WORLD = {
  size: 6400,
  grid: 100,
  seaLevel: 0,
  maxHeight: 280,
};

/** The home runway: a flat strip on the south coast, running north (+z). */
export const RUNWAY = {
  x: 0,
  z: -1600,
  length: 900,
  width: 46,
  height: 9,
  heading: 0, // radians; 0 = north (+z)
};

/** The aeroplane: a sturdy little high-wing courier. Speeds in m/s, rates in rad/s. */
export const PLANE = {
  maxSpeed: 88, // ~171 kt
  stallSpeed: 23, // ~45 kt; below this the wing stops flying
  takeoffSpeed: 31,
  engineAccel: 10.5,
  dragK: 0.00135, // quadratic drag: accel -= dragK * v^2
  pitchRate: 0.85,
  pitchMin: -0.62, // -35°
  pitchMax: 0.55, // +31°
  rollRate: 1.7,
  rollMax: 0.96, // 55° of bank
  gravity: 9.81,
  groundFriction: 0.55, // m/s² of rolling drag on the strip
  brakeDecel: 6.5,
  gearHeight: 1.6, // fuselage centre above the wheels' contact patch
};

/** Fuel and hull: the two gauges that turn a sortie into decisions. */
export const SUPPLY = {
  fuelMax: 200,
  fuelIdleBurn: 0.12, // per second at closed throttle
  fuelFullBurn: 0.9, // per second at full throttle — cruise sips, flat-out forces a refuel stop
  hullMax: 100,
  hardLandingVSpeed: 5.5, // m/s of descent at touchdown before the gear complains
  crashVSpeed: 13,
};

/** The sortie: rings, then cargo, then home. */
export const SORTIE = {
  ringCount: 8,
  ringRadius: 30,
  ringScore: 500,
  ringTimeBonus: 12, // per second under par, banked at the end
  crateCount: 2,
  crateScore: 1000,
  landingScore: 1000,
  parTime: 300, // seconds; finish faster for the time bonus
};

/** Camera and view. */
export const CAMERA = {
  back: 27, // metres behind the aeroplane
  up: 7.5, // metres above it
  ahead: 70, // look-at point this far in front
  fov: 1.08, // radians, vertical-ish field of view factor
  far: 4200, // terrain beyond this is haze, not drawn
  near: 1.2,
};

/** Palette: one flat, sunlit style for sky, sea, land and the aeroplane. */
export const COLORS = {
  skyTop: '#3d7ac8',
  skyMid: '#7fb2e5',
  skyLow: '#cfe6f7',
  haze: '#d8ecfa',
  sun: '#fff3c4',
  cloud: '#ffffff',
  deepWater: '#1d5f9e',
  water: '#2e86c9',
  shallow: '#57b6d9',
  sand: '#ecd9a0',
  grassLow: '#8fce62',
  grass: '#5da84c',
  forest: '#3d7a3a',
  rock: '#8a8378',
  peak: '#e8e4da',
  asphalt: '#3c4048',
  runwayPaint: '#f4f4f4',
  ringNext: '#ffd23e',
  ringIdle: '#2ee6c8',
  ringDone: '#9fb7c9',
  beacon: '#ff7a3e',
  planeBody: '#f6f1e3',
  planeTrim: '#e8641e',
  planeDark: '#2b2f36',
  hudInk: '#10202e',
  hudPanel: 'rgba(10, 26, 40, 0.62)',
  hudLine: 'rgba(160, 220, 255, 0.85)',
  hudText: '#eaf6ff',
  hudWarn: '#ff5a4e',
  hudGood: '#57e389',
};

// The view from behind the courier at golden hour: an honest 3D projection over a
// flat-shaded heightfield coast. Terrain quads are painted far-to-near; the runway,
// rings, town, boats and birds are projected polygons; the aeroplane is drawn in
// screen space at the heart of the frame, banked and pitched with the real one —
// the classic chase view. The sun sits low in the south-west, so the sea glints
// and every cloud wears a warm edge.
import { CAMERA, COLORS, RUNWAY, WORLD } from './config.js';
import { terrainColor } from './terrain.js';
import { drawHud, drawOverlay } from './hud.js';
import { predictCrateLanding } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function normalize(v) {
  const len = Math.max(1e-6, Math.sqrt(dot(v, v)));
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Precompute every terrain quad's corners, centre and colour once; the coast never moves. */
function buildTerrainQuads(terrain) {
  const { grid, size } = WORLD;
  const cell = terrain.cell;
  const half = size / 2;
  const quads = [];
  const at = (gx, gz) => ({
    x: -half + gx * cell,
    y: terrain.heights[gz * grid + gx],
    z: -half + gz * cell,
  });
  for (let gz = 0; gz < grid - 1; gz += 1) {
    for (let gx = 0; gx < grid - 1; gx += 1) {
      const a = at(gx, gz);
      const b = at(gx + 1, gz);
      const c = at(gx + 1, gz + 1);
      const d = at(gx, gz + 1);
      const avg = (a.y + b.y + c.y + d.y) / 4;
      const slope = Math.min(1, (Math.max(a.y, b.y, c.y, d.y) - Math.min(a.y, b.y, c.y, d.y)) / (cell * 0.9));
      const draw = (p) => ({ x: p.x, y: Math.max(0, p.y), z: p.z });
      quads.push({
        corners: [draw(a), draw(b), draw(c), draw(d)],
        cx: (a.x + c.x) / 2,
        cz: (a.z + c.z) / 2,
        cy: Math.max(0, avg),
        color: terrainColor(avg, slope),
        water: avg <= -2,
      });
    }
  }
  return quads;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let quads = null;
  let camHeading = 0;
  let camPitch = 0;
  let frameTime = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.floor(canvas.clientWidth * dpr) || 1280;
    height = Math.floor(canvas.clientHeight * dpr) || 720;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  /** Build the camera for this frame and return the projection helpers. */
  function makeView(plane, dt) {
    // The camera trails the aeroplane's heading and pitch, a beat behind, so the
    // horizon breathes instead of snapping.
    let dh = plane.heading - camHeading;
    while (dh > Math.PI) dh -= TAU;
    while (dh < -Math.PI) dh += TAU;
    camHeading += dh * Math.min(1, dt * 3.2);
    camPitch += (plane.pitch * 0.55 - camPitch) * Math.min(1, dt * 3.2);

    const fwdH = { x: Math.sin(camHeading), y: 0, z: Math.cos(camHeading) };
    const camPos = {
      x: plane.x - fwdH.x * CAMERA.back,
      y: plane.y + CAMERA.up - Math.sin(camPitch) * CAMERA.back * 0.4,
      z: plane.z - fwdH.z * CAMERA.back,
    };
    const lookAt = {
      x: plane.x + fwdH.x * CAMERA.ahead,
      y: plane.y + Math.sin(camPitch) * CAMERA.ahead - 4,
      z: plane.z + fwdH.z * CAMERA.ahead,
    };
    const fwd = normalize(sub(lookAt, camPos));
    const right = normalize(cross(fwd, { x: 0, y: 1, z: 0 }));
    const up = cross(right, fwd);
    const focal = height / 2 / Math.tan(CAMERA.fov / 2);
    const cx = width / 2;
    const cy = height / 2;

    function project(p) {
      const v = sub(p, camPos);
      const z = dot(v, fwd);
      if (z < CAMERA.near) return null;
      return { x: cx + (dot(v, right) / z) * focal, y: cy - (dot(v, up) / z) * focal, z };
    }
    function depthOf(p) {
      return dot(sub(p, camPos), fwd);
    }
    return { camPos, fwd, right, up, focal, cx, cy, project, depthOf, width, height };
  }

  function poly(points, fill) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawSky(view) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, COLORS.skyTop);
    grad.addColorStop(0.45, COLORS.skyMid);
    grad.addColorStop(0.72, COLORS.skyLow);
    grad.addColorStop(0.92, COLORS.skyHorizon);
    grad.addColorStop(1, COLORS.haze);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    // The low sun: fixed in the south-west sky, so it sweeps as you turn and
    // floods the frame with gold when you fly toward it.
    const sunDir = normalize({ x: -0.62, y: 0.2, z: -0.5 });
    const sunPoint = {
      x: view.camPos.x + sunDir.x * 3000,
      y: view.camPos.y + sunDir.y * 3000,
      z: view.camPos.z + sunDir.z * 3000,
    };
    const s = view.project(sunPoint);
    if (s) {
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, height * 0.5);
      glow.addColorStop(0, 'rgba(255, 220, 150, 0.9)');
      glow.addColorStop(0.16, COLORS.sunGlow);
      glow.addColorStop(1, 'rgba(255, 196, 110, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.beginPath();
      ctx.arc(s.x, s.y, height * 0.042, 0, TAU);
      ctx.fillStyle = COLORS.sun;
      ctx.fill();
    }
  }

  function drawTerrain(view) {
    const visible = [];
    for (const q of quads) {
      const dx = q.cx - view.camPos.x;
      const dz = q.cz - view.camPos.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > CAMERA.far * CAMERA.far) continue;
      const depth = view.depthOf({ x: q.cx, y: q.cy, z: q.cz });
      if (depth < 2) continue;
      visible.push({ q, depth });
    }
    visible.sort((a, b) => b.depth - a.depth);
    for (const { q } of visible) {
      const pts = [];
      let ok = true;
      for (const corner of q.corners) {
        const p = view.project(corner);
        if (!p) {
          ok = false;
          break;
        }
        pts.push(p);
      }
      if (!ok) continue;
      poly(pts, q.color);
      // Sun glint: a few water quads flash gold as the light catches them.
      if (q.water && Math.sin(frameTime * 1.7 + q.cx * 0.011 + q.cz * 0.017) > 0.86) {
        ctx.globalAlpha = 0.28;
        poly(pts, COLORS.waterGlint);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** The windsock beside the touchdown zone: a pole and an orange sock that
   *  streams with the wind and droops when it eases — the wind made visible. */
  function drawWindsock(view, spot, terrain, wind) {
    const gy = terrain.groundHeightAt(spot.x, spot.z);
    const top = view.project({ x: spot.x, y: gy + 11, z: spot.z });
    const base = view.project({ x: spot.x, y: gy, z: spot.z });
    if (!top || !base || top.z > CAMERA.far) return;
    ctx.strokeStyle = '#e8e4da';
    ctx.lineWidth = Math.max(1.4, 120 / top.z);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    // The sock: points downwind, length and droop by wind strength.
    const len = Math.max(5, (3.2 + wind.speed * 0.55) * (900 / top.z));
    const droop = Math.max(0, 1 - wind.speed / 11) * len * 0.55;
    const tip = view.project({
      x: spot.x + Math.sin(wind.dir) * (3.2 + wind.speed * 0.55),
      y: gy + 11 - Math.max(0, 1 - wind.speed / 11) * 3.4,
      z: spot.z + Math.cos(wind.dir) * (3.2 + wind.speed * 0.55),
    });
    if (tip) {
      ctx.strokeStyle = COLORS.beacon;
      ctx.lineWidth = Math.max(2, 260 / top.z);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.quadraticCurveTo((top.x + tip.x) / 2, (top.y + tip.y) / 2 + droop * 0.3, tip.x, tip.y);
      ctx.stroke();
    }
  }

  function drawRunway(view, plane) {
    const y = RUNWAY.height + 0.35;
    const hw = RUNWAY.width / 2;
    const hl = RUNWAY.length / 2;
    const x0 = RUNWAY.x - hw;
    const x1 = RUNWAY.x + hw;
    const z0 = RUNWAY.z - hl;
    const z1 = RUNWAY.z + hl;
    const segments = 12;
    for (let i = 0; i < segments; i += 1) {
      const za = z0 + (RUNWAY.length * i) / segments;
      const zb = z0 + (RUNWAY.length * (i + 1)) / segments;
      const pts = [
        view.project({ x: x0, y, z: za }),
        view.project({ x: x1, y, z: za }),
        view.project({ x: x1, y, z: zb }),
        view.project({ x: x0, y, z: zb }),
      ];
      if (pts.every(Boolean)) poly(pts, COLORS.asphalt);
    }
    // Threshold bars, centreline dashes and touchdown-zone marks, in paint white.
    const paint = (px, pz, w, l) => {
      const pts = [
        view.project({ x: px - w / 2, y: y + 0.06, z: pz - l / 2 }),
        view.project({ x: px + w / 2, y: y + 0.06, z: pz - l / 2 }),
        view.project({ x: px + w / 2, y: y + 0.06, z: pz + l / 2 }),
        view.project({ x: px - w / 2, y: y + 0.06, z: pz + l / 2 }),
      ];
      if (pts.every(Boolean)) poly(pts, COLORS.runwayPaint);
    };
    for (let i = -2; i <= 2; i += 1) {
      paint(RUNWAY.x + i * 8, z0 + 26, 3.4, 34);
      paint(RUNWAY.x + i * 8, z1 - 26, 3.4, 34);
    }
    for (let z = z0 + 90; z < z1 - 80; z += 70) paint(RUNWAY.x, z, 2.2, 34);
    paint(RUNWAY.x - 9, z0 + 210, 3, 46);
    paint(RUNWAY.x + 9, z0 + 210, 3, 46);
    // Edge lights: amber dots down both sides.
    for (let z = z0; z <= z1; z += 75) {
      for (const ex of [x0 - 3, x1 + 3]) {
        const p = view.project({ x: ex, y: y + 1.2, z });
        if (p) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1.2, 160 / p.z), 0, TAU);
          ctx.fillStyle = '#ffc95e';
          ctx.fill();
        }
      }
    }
    // Approach sequencer ("the rabbit"): a chase of white flashes running in
    // toward the threshold from the south, so final is easy to find at dusk.
    for (let i = 0; i < 7; i += 1) {
      const p = view.project({ x: RUNWAY.x, y: y + 1.5, z: z0 - 60 - i * 65 });
      if (!p) continue;
      const lit = Math.floor(frameTime * 2.2) % 7 === i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.4, (lit ? 340 : 150) / p.z), 0, TAU);
      ctx.fillStyle = lit ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.fill();
    }
    // PAPI: four boxes beside the touchdown zone. On a 3° glidepath two show
    // white and two red; too high is all white, too low all red.
    const aimZ = z0 + 240;
    const distToAim = Math.max(1, aimZ - plane.z);
    const glide = Math.atan2(plane.y - (RUNWAY.height + 3), distToAim) * (180 / Math.PI);
    const whites = glide > 3.7 ? 4 : glide > 3.2 ? 3 : glide > 2.7 ? 2 : glide > 2.2 ? 1 : 0;
    for (let i = 0; i < 4; i += 1) {
      const p = view.project({ x: x0 - 14 - i * 7, y: y + 1.6, z: aimZ });
      if (!p) continue;
      const s = Math.max(2, 220 / p.z);
      ctx.fillStyle = i < whites ? '#ffffff' : '#ff4a3e';
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }

  function drawRing(view, ring, state) {
    const points = [];
    const up = { x: 0, y: 1, z: 0 };
    const n = { x: ring.nx, y: 0, z: ring.nz };
    const side = normalize(cross(up, n));
    for (let i = 0; i <= 28; i += 1) {
      const a = (i / 28) * TAU;
      const p = {
        x: ring.x + side.x * Math.cos(a) * ring.radius,
        y: ring.y + Math.sin(a) * ring.radius,
        z: ring.z + side.z * Math.cos(a) * ring.radius,
      };
      points.push(view.project(p));
    }
    if (points.some((p) => !p)) return;
    const centre = view.project(ring);
    const widthPx = Math.max(2, Math.min(13, 900 / Math.max(30, centre.z)));
    const pulse = 0.72 + 0.28 * Math.sin(frameTime * 4);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points) ctx.lineTo(p.x, p.y);
    if (state === 'next') {
      ctx.strokeStyle = `rgba(255, 210, 62, ${0.35 * pulse})`;
      ctx.lineWidth = widthPx * 2.6;
      ctx.stroke();
      ctx.strokeStyle = COLORS.ringNext;
      ctx.lineWidth = widthPx;
      ctx.stroke();
    } else if (state === 'done') {
      ctx.strokeStyle = 'rgba(159, 183, 201, 0.4)';
      ctx.lineWidth = widthPx * 0.7;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(46, 230, 200, 0.55)';
      ctx.lineWidth = widthPx * 0.8;
      ctx.stroke();
    }
    // The ring's number, hung at its crown so the course order reads at a glance.
    const crown = view.project({ x: ring.x, y: ring.y + ring.radius + 7, z: ring.z });
    if (crown && crown.z < 1500) {
      const size = Math.max(10, Math.min(30, 2600 / crown.z));
      ctx.font = `bold ${size}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = state === 'next' ? '#ffd23e' : 'rgba(234,246,255,0.75)';
      ctx.fillText(String(ring.number), crown.x, crown.y);
    }
  }

  function drawDropZone(view, zone, terrain) {
    const gy = terrain.groundHeightAt(zone.x, zone.z);
    // Ground target: concentric rings laid on the clearing.
    for (const [r, color] of [
      [zone.radius, COLORS.beacon],
      [zone.radius * 0.55, '#ffffff'],
      [zone.radius * 0.22, COLORS.beacon],
    ]) {
      const pts = [];
      let ok = true;
      for (let i = 0; i <= 24; i += 1) {
        const a = (i / 24) * TAU;
        const p = view.project({ x: zone.x + Math.cos(a) * r, y: gy + 0.5, z: zone.z + Math.sin(a) * r });
        if (!p) {
          ok = false;
          break;
        }
        pts.push(p);
      }
      if (ok) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, 260 / pts[0].z);
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // A light beacon so the island can be found from the air.
    const beam = [
      view.project({ x: zone.x - 6, y: gy, z: zone.z }),
      view.project({ x: zone.x + 6, y: gy, z: zone.z }),
      view.project({ x: zone.x + 6, y: gy + 300, z: zone.z }),
      view.project({ x: zone.x - 6, y: gy + 300, z: zone.z }),
    ];
    if (beam.every(Boolean)) {
      ctx.globalAlpha = 0.16 + 0.07 * Math.sin(frameTime * 2.4);
      poly(beam, COLORS.beacon);
      ctx.globalAlpha = 1;
    }
  }

  /** The bomb-sight: where a crate dropped now would land, as a ground cross. */
  function drawBombSight(view, world) {
    const hit = predictCrateLanding(world.missions, world.plane, world.terrain, world.wind);
    if (!hit) return;
    const gy = world.terrain.groundHeightAt(hit.x, hit.z);
    const c = view.project({ x: hit.x, y: gy + 1.2, z: hit.z });
    if (!c) return;
    const inZone = hit.dist <= world.missions.dropZone.radius;
    const s = Math.max(6, Math.min(26, 2400 / c.z));
    ctx.strokeStyle = inZone ? COLORS.hudGood : '#ffb84e';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(c.x, c.y, s, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x - s * 1.5, c.y);
    ctx.lineTo(c.x + s * 1.5, c.y);
    ctx.moveTo(c.x, c.y - s * 1.5);
    ctx.lineTo(c.x, c.y + s * 1.5);
    ctx.stroke();
    // A dotted fall line from the belly to the cross.
    const belly = view.project({ x: world.plane.x, y: world.plane.y - 3, z: world.plane.z });
    if (belly) {
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(belly.x, belly.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawCrate(view, crate) {
    const p = view.project(crate);
    if (!p) return;
    const s = Math.max(3, 540 / p.z);
    // Canopy, lines, box — a crate under a little parachute.
    ctx.strokeStyle = 'rgba(20,30,40,0.7)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.9, p.y - s * 1.5);
    ctx.lineTo(p.x, p.y);
    ctx.moveTo(p.x + s * 0.9, p.y - s * 1.5);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - s * 1.6, s * 1.05, s * 0.42, 0, Math.PI, TAU);
    ctx.fillStyle = COLORS.planeTrim;
    ctx.fill();
    ctx.fillStyle = '#b98a4e';
    ctx.fillRect(p.x - s * 0.42, p.y - s * 0.1, s * 0.84, s * 0.7);
    ctx.strokeStyle = 'rgba(60,40,16,0.8)';
    ctx.strokeRect(p.x - s * 0.42, p.y - s * 0.1, s * 0.84, s * 0.7);
  }

  /** The harbour town: little houses with pitched roofs on the flat west ground. */
  function drawTown(view, houses) {
    const sorted = houses
      .map((h) => ({ h, depth: view.depthOf(h) }))
      .filter((e) => e.depth > 4 && e.depth < CAMERA.far)
      .sort((a, b) => b.depth - a.depth);
    for (const { h } of sorted) {
      const cos = Math.cos(h.rot);
      const sin = Math.sin(h.rot);
      const corner = (dx, dy, dz) =>
        view.project({ x: h.x + dx * cos - dz * sin, y: h.y + dy, z: h.z + dx * sin + dz * cos });
      const hw = h.w / 2;
      const hd = h.d / 2;
      // Walls (front face only — the chase view rarely sees more) and the roof.
      const front = [corner(-hw, 0, hd), corner(hw, 0, hd), corner(hw, h.h, hd), corner(-hw, h.h, hd)];
      const side = [corner(hw, 0, hd), corner(hw, 0, -hd), corner(hw, h.h, -hd), corner(hw, h.h, hd)];
      const roof = [
        corner(-hw - 1, h.h, hd + 1),
        corner(hw + 1, h.h, hd + 1),
        corner(hw + 1, h.h, -hd - 1),
        corner(-hw - 1, h.h, -hd - 1),
      ];
      const ridge = [
        corner(-hw - 1, h.h, hd + 1),
        corner(hw + 1, h.h, hd + 1),
        corner(0, h.h + h.h * 0.55, 0),
      ];
      if (front.every(Boolean)) poly(front, h.wall);
      if (side.every(Boolean)) poly(side, h.wall);
      if (roof.every(Boolean)) poly(roof, h.roof);
      if (ridge.every(Boolean)) poly(ridge, h.roof);
    }
  }

  /** The lighthouse: a striped tower with a slowly rotating beam. */
  function drawLighthouse(view, spot, terrain) {
    const gy = terrain.groundHeightAt(spot.x, spot.z);
    const top = view.project({ x: spot.x, y: gy + 34, z: spot.z });
    const base = view.project({ x: spot.x, y: gy, z: spot.z });
    if (!top || !base || top.z > CAMERA.far) return;
    const w = Math.max(2, 260 / top.z);
    ctx.fillStyle = '#f2ece2';
    ctx.fillRect(base.x - w / 2, top.y, w, base.y - top.y);
    ctx.fillStyle = '#c9403d';
    ctx.fillRect(base.x - w / 2, top.y + (base.y - top.y) * 0.35, w, (base.y - top.y) * 0.2);
    ctx.fillRect(base.x - w / 2, top.y + (base.y - top.y) * 0.7, w, (base.y - top.y) * 0.2);
    // Rotating beam: a translucent wedge sweeping the water.
    const angle = frameTime * 0.7;
    const tip = view.project({
      x: spot.x + Math.sin(angle) * 420,
      y: gy + 6,
      z: spot.z + Math.cos(angle) * 420,
    });
    if (tip) {
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(tip.x - 14, tip.y);
      ctx.lineTo(tip.x + 14, tip.y);
      ctx.closePath();
      ctx.fillStyle = '#ffe9b0';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(top.x, top.y, Math.max(2, 200 / top.z), 0, TAU);
    ctx.fillStyle = '#fff3c4';
    ctx.fill();
  }

  /** Fishing boats on slow circuits, with a wake. */
  function drawBoats(view, boats) {
    for (const boat of boats) {
      const x = boat.cx + Math.cos(boat.phase) * boat.radius;
      const z = boat.cz + Math.sin(boat.phase) * boat.radius;
      const p = view.project({ x, y: 1.2, z });
      if (!p || p.z > CAMERA.far) continue;
      const s = Math.max(2.5, 900 / p.z);
      // Wake: a fading V behind the hull.
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - s * 1.6, p.y + s * 0.5);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + s * 1.6, p.y + s * 0.5);
      ctx.stroke();
      // Hull and little cabin.
      ctx.fillStyle = boat.hue;
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.9, p.y);
      ctx.lineTo(p.x + s * 0.9, p.y);
      ctx.lineTo(p.x + s * 0.6, p.y + s * 0.34);
      ctx.lineTo(p.x - s * 0.6, p.y + s * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2ece2';
      ctx.fillRect(p.x - s * 0.22, p.y - s * 0.42, s * 0.44, s * 0.42);
    }
  }

  /** Gulls: two flapping strokes wheeling over the harbour and the island. */
  function drawBirds(view, birds, terrain) {
    ctx.strokeStyle = 'rgba(30,40,52,0.8)';
    for (const bird of birds) {
      const x = bird.cx + Math.cos(bird.phase) * bird.radius;
      const z = bird.cz + Math.sin(bird.phase) * bird.radius;
      const y = terrain.groundHeightAt(x, z) + bird.cy + Math.sin(bird.phase * 2.3) * 6;
      const p = view.project({ x, y, z });
      if (!p || p.z > 1600) continue;
      const s = Math.max(2, 320 / p.z);
      const flap = Math.sin(bird.flap) * s * 0.5;
      ctx.lineWidth = Math.max(1, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(p.x - s, p.y + flap);
      ctx.quadraticCurveTo(p.x - s * 0.4, p.y - s * 0.3, p.x, p.y);
      ctx.quadraticCurveTo(p.x + s * 0.4, p.y - s * 0.3, p.x + s, p.y + flap);
      ctx.stroke();
    }
  }

  function drawClouds(view, clouds) {
    const sorted = clouds
      .map((c) => ({ c, p: view.project(c) }))
      .filter((e) => e.p && e.p.z > 160 && e.p.z < CAMERA.far)
      .sort((a, b) => b.p.z - a.p.z);
    for (const { c, p } of sorted) {
      const s = (c.r / p.z) * view.focal;
      if (s < 4) continue;
      // Warm-lit tops, shaded bellies: the golden-hour read.
      ctx.fillStyle = 'rgba(255,244,224,0.85)';
      for (const [ox, oy, r] of [
        [0, 0, 1],
        [-0.55, 0.12, 0.66],
        [0.55, 0.1, 0.72],
        [0.1, -0.22, 0.6],
      ]) {
        ctx.beginPath();
        ctx.ellipse(p.x + ox * s, p.y + oy * s * 0.4, s * r, s * r * 0.42, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(232,180,140,0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + s * 0.18, s * 0.85, s * 0.3, 0, 0, Math.PI);
      ctx.fill();
    }
  }

  function drawParticles(view, particles) {
    for (const p of particles) {
      const s = view.project(p);
      if (!s) continue;
      const t = Math.max(0, p.life / p.maxLife);
      const r = Math.max(1.5, (p.kind === 'smoke' ? 260 : 150) / s.z) * (p.kind === 'smoke' ? 2 - t : 1);
      ctx.globalAlpha = Math.min(0.85, t * 1.2);
      ctx.fillStyle =
        p.kind === 'fire'
          ? '#ff8a3e'
          : p.kind === 'splash'
            ? '#bfe6ff'
            : p.kind === 'spark'
              ? '#ffd23e'
              : p.kind === 'smoke'
                ? '#4a4f57'
                : p.kind === 'vapour'
                  ? '#ffffff'
                  : '#d9c9a3';
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Floating score popups where the points were earned. */
  function drawPopups(view, popups) {
    for (const p of popups) {
      const s = view.project(p);
      if (!s) continue;
      const t = Math.max(0, p.life / p.maxLife);
      const size = Math.max(13, Math.min(30, 2600 / s.z));
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.font = `bold ${size}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  /** The aeroplane, drawn from behind in screen space at the heart of the frame. */
  function drawPlane(view, plane, terrain) {
    // Ground shadow first: the pilot's best height gauge.
    const gy = terrain.groundHeightAt(plane.x, plane.z);
    const shadow = view.project({ x: plane.x, y: gy + 0.4, z: plane.z });
    const agl = Math.max(0, plane.y - gy);
    if (shadow && agl < 320) {
      const sr = Math.max(3, (11 / Math.max(20, shadow.z)) * view.focal * 0.09);
      ctx.globalAlpha = Math.max(0, 0.4 * (1 - agl / 320));
      ctx.fillStyle = '#0c1c26';
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, sr * 1.5, sr * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const u = Math.min(width, height) / 575; // sprite unit — a big, readable airframe
    const px = view.cx;
    const py = view.cy + height * 0.115 + plane.pitch * 46 * u;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-plane.roll * 0.92);

    // Tail fin (nearest the camera, drawn first so the fuselage overlaps it),
    // with a white band so the livery reads at a glance.
    ctx.fillStyle = COLORS.planeTrim;
    ctx.beginPath();
    ctx.moveTo(-6 * u, 26 * u);
    ctx.lineTo(0, -34 * u);
    ctx.lineTo(9 * u, 24 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f6f1e3';
    ctx.beginPath();
    ctx.moveTo(-2.6 * u, -8 * u);
    ctx.lineTo(0, -20 * u);
    ctx.lineTo(3.4 * u, -7 * u);
    ctx.lineTo(1 * u, -2 * u);
    ctx.closePath();
    ctx.fill();
    // Horizontal stabiliser.
    ctx.fillStyle = COLORS.planeBody;
    ctx.beginPath();
    ctx.moveTo(-58 * u, 30 * u);
    ctx.lineTo(58 * u, 30 * u);
    ctx.lineTo(46 * u, 40 * u);
    ctx.lineTo(-46 * u, 40 * u);
    ctx.closePath();
    ctx.fill();
    // Main wing with a hint of dihedral.
    ctx.beginPath();
    ctx.moveTo(-118 * u, -2 * u);
    ctx.lineTo(-16 * u, -12 * u);
    ctx.lineTo(16 * u, -12 * u);
    ctx.lineTo(118 * u, -2 * u);
    ctx.lineTo(112 * u, 8 * u);
    ctx.lineTo(-112 * u, 8 * u);
    ctx.closePath();
    ctx.fillStyle = COLORS.planeBody;
    ctx.fill();
    ctx.fillStyle = COLORS.planeTrim;
    ctx.fillRect(-118 * u, -3 * u, 26 * u, 9 * u);
    ctx.fillRect(92 * u, -3 * u, 26 * u, 9 * u);
    // Flaps: trailing-edge panels that droop as they travel down.
    if (plane.flaps > 0.03) {
      const droop = plane.flaps * 9 * u;
      ctx.fillStyle = '#d8cfb8';
      ctx.beginPath();
      ctx.moveTo(-88 * u, 6 * u);
      ctx.lineTo(-30 * u, 6 * u);
      ctx.lineTo(-30 * u, 6 * u + droop);
      ctx.lineTo(-88 * u, 6 * u + droop);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(30 * u, 6 * u);
      ctx.lineTo(88 * u, 6 * u);
      ctx.lineTo(88 * u, 6 * u + droop);
      ctx.lineTo(30 * u, 6 * u + droop);
      ctx.closePath();
      ctx.fill();
    }
    // Navigation lights: red on the left tip, green on the right, white on the tail.
    ctx.fillStyle = COLORS.navRed;
    ctx.beginPath();
    ctx.arc(-116 * u, 2 * u, 3.4 * u, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COLORS.navGreen;
    ctx.beginPath();
    ctx.arc(116 * u, 2 * u, 3.4 * u, 0, TAU);
    ctx.fill();
    // Wing struts: the little braced wing of a bush courier.
    ctx.strokeStyle = COLORS.planeDark;
    ctx.lineWidth = 2.2 * u;
    ctx.beginPath();
    ctx.moveTo(-9 * u, 18 * u);
    ctx.lineTo(-52 * u, 0);
    ctx.moveTo(9 * u, 18 * u);
    ctx.lineTo(52 * u, 0);
    ctx.stroke();
    // Fuselage tapering away to the nose.
    const body = ctx.createLinearGradient(0, 34 * u, 0, -58 * u);
    body.addColorStop(0, COLORS.planeBody);
    body.addColorStop(1, '#e8dfca');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-15 * u, 34 * u);
    ctx.quadraticCurveTo(-17 * u, -6 * u, -9 * u, -40 * u);
    ctx.quadraticCurveTo(0, -56 * u, 9 * u, -40 * u);
    ctx.quadraticCurveTo(17 * u, -6 * u, 15 * u, 34 * u);
    ctx.quadraticCurveTo(0, 42 * u, -15 * u, 34 * u);
    ctx.fill();
    // Cheatline stripe and cabin windows.
    ctx.fillStyle = COLORS.planeTrim;
    ctx.fillRect(-14.5 * u, 6 * u, 29 * u, 5 * u);
    ctx.fillStyle = '#274b63';
    ctx.beginPath();
    ctx.ellipse(0, -22 * u, 8.5 * u, 11 * u, 0, 0, TAU);
    ctx.fill();
    // Fixed gear: two legs and wheels.
    ctx.strokeStyle = COLORS.planeDark;
    ctx.lineWidth = 3.4 * u;
    ctx.beginPath();
    ctx.moveTo(-10 * u, 16 * u);
    ctx.lineTo(-17 * u, 34 * u);
    ctx.moveTo(10 * u, 16 * u);
    ctx.lineTo(17 * u, 34 * u);
    ctx.stroke();
    ctx.fillStyle = COLORS.planeDark;
    ctx.beginPath();
    ctx.ellipse(-18 * u, 37 * u, 5 * u, 7 * u, 0, 0, TAU);
    ctx.ellipse(18 * u, 37 * u, 5 * u, 7 * u, 0, 0, TAU);
    ctx.fill();
    // Propeller: a translucent disc and two blurred blades at the far end.
    ctx.globalAlpha = 0.16 + plane.throttle * 0.12;
    ctx.fillStyle = '#20262e';
    ctx.beginPath();
    ctx.ellipse(0, -52 * u, 34 * u, 5.5 * u, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.save();
    ctx.translate(0, -52 * u);
    ctx.rotate(plane.propAngle);
    ctx.fillRect(-33 * u, -1.6 * u, 66 * u, 3.2 * u);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function draw(world, screen, best, dt = 1 / 60) {
    resize();
    if (!quads) quads = buildTerrainQuads(world.terrain);
    frameTime += dt;
    const { plane, terrain, missions } = world;
    const view = makeView(plane, dt);

    drawSky(view);
    drawTerrain(view);
    drawRunway(view, plane);
    drawWindsock(view, terrain.windsock, terrain, world.wind);
    drawTown(view, terrain.houses);
    drawLighthouse(view, terrain.lighthouse, terrain);
    drawBoats(view, world.boats);
    // The drop zone only matters once the cargo phase begins; showing it
    // during the ring course clutters the low-altitude view.
    if (missions.phase !== 'rings') drawDropZone(view, missions.dropZone, terrain);
    if (missions.phase === 'cargo') drawBombSight(view, world);
    missions.rings.forEach((ring, i) => {
      drawRing(view, ring, ring.passed ? 'done' : i === missions.ringIndex && missions.phase === 'rings' ? 'next' : 'idle');
    });
    if (missions.crate) drawCrate(view, missions.crate);
    drawClouds(view, world.clouds);
    drawBirds(view, world.birds, terrain);
    drawParticles(view, world.particles);
    drawPlane(view, plane, terrain);
    drawPopups(view, world.popups);

    drawHud(ctx, view, world);
    if (screen !== SCREEN_PLAY) drawOverlay(ctx, view, world, screen, best);
  }

  return { draw };
}

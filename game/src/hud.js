// The instruments: airspeed and altitude tapes, a compass strip, throttle/fuel/hull
// gauges, the mission banner and the target arrow — everything a pilot reads at a
// glance, drawn as lit glass over the world. Plus the title, pause and summary cards.
import { COLORS, PLANE, SORTIE, SUPPLY } from './config.js';
import { altitudeAboveGround, headingDegrees } from './plane.js';
import { currentTarget, PHASE_CARGO, PHASE_RINGS } from './missions.js';

const FONT = '"Arial Narrow", Arial, sans-serif';

function panel(ctx, x, y, w, h, r = 10) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = COLORS.hudPanel;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,220,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function text(ctx, str, x, y, size, color = COLORS.hudText, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

/** A vertical tape with the current value boxed in the middle (airspeed, altitude). */
function tape(ctx, x, y, w, h, value, step, label, format) {
  panel(ctx, x, y, w, h, 8);
  const midY = y + h / 2;
  const pxPerUnit = h / (step * 6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();
  const first = Math.floor((value - step * 3.2) / step) * step;
  for (let v = first; v <= value + step * 3.4; v += step) {
    if (v < 0) continue;
    const ty = midY - (v - value) * pxPerUnit;
    ctx.strokeStyle = COLORS.hudLine;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + w - 16, ty);
    ctx.lineTo(x + w - 5, ty);
    ctx.stroke();
    text(ctx, format(v), x + w - 20, ty, 12, COLORS.hudText, 'right', 'normal');
  }
  ctx.restore();
  // The value box.
  ctx.fillStyle = '#0a1a28';
  ctx.strokeStyle = COLORS.hudLine;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x + 3, midY - 14, w - 6, 28, 5);
  ctx.fill();
  ctx.stroke();
  text(ctx, format(Math.round(value)), x + w / 2, midY + 1, 19, '#ffffff', 'center');
  text(ctx, label, x + w / 2, y - 11, 12, COLORS.hudLine, 'center');
}

function gauge(ctx, x, y, w, h, frac, label, color, warnAt = -1) {
  text(ctx, label, x, y - 9, 11.5, COLORS.hudLine, 'left');
  ctx.fillStyle = 'rgba(8,20,32,0.75)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  const f = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = warnAt >= 0 && f <= warnAt ? COLORS.hudWarn : color;
  if (f > 0) {
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, Math.max(3, (w - 3) * f), h - 3, 3);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(160,220,255,0.4)';
  ctx.strokeRect(x, y, w, h);
}

function compass(ctx, view, headingDeg) {
  const w = Math.min(430, view.width * 0.42);
  const x = view.cx - w / 2;
  const y = 14;
  panel(ctx, x, y, w, 44, 9);
  const pxPerDeg = w / 90;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, w - 6, 38);
  ctx.clip();
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = Math.floor((headingDeg - 50) / 5) * 5; d <= headingDeg + 50; d += 5) {
    const norm = ((d % 360) + 360) % 360;
    const tx = view.cx + (d - headingDeg) * pxPerDeg;
    const major = norm % 45 === 0;
    ctx.strokeStyle = COLORS.hudLine;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(tx, y + (major ? 8 : 13));
    ctx.lineTo(tx, y + 20);
    ctx.stroke();
    if (major) text(ctx, names[norm], tx, y + 32, 15, norm === 0 ? '#ffd23e' : COLORS.hudText, 'center');
    else if (norm % 15 === 0) text(ctx, String(Math.floor(norm / 10)), tx, y + 32, 11, COLORS.hudLine, 'center', 'normal');
  }
  ctx.restore();
  // Lubber line and digital heading.
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(view.cx - 6, y + 2);
  ctx.lineTo(view.cx + 6, y + 2);
  ctx.lineTo(view.cx, y + 11);
  ctx.closePath();
  ctx.fill();
  text(ctx, `${String(Math.round(headingDeg) % 360).padStart(3, '0')}°`, view.cx, y + 56, 15, '#ffffff', 'center');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Everything the pilot reads while flying. */
export function drawHud(ctx, view, world) {
  const { plane, terrain, missions, state } = world;
  const u = view.height / 720;
  const knots = plane.speed * 1.944;
  const feet = altitudeAboveGround(plane, terrain) * 3.281;
  const heading = headingDegrees(plane);

  tape(ctx, 16 * u, 120 * u, 92 * u, 250 * u, knots, 10, 'KT', (v) => String(v));
  tape(ctx, view.width - 108 * u, 120 * u, 92 * u, 250 * u, feet, 100, 'FT AGL', (v) => String(v));
  compass(ctx, view, heading);

  // Vertical speed, small, under the altimeter.
  const vsFpm = Math.round(plane.vy * 196.85);
  text(ctx, `${vsFpm >= 0 ? '▲' : '▼'} ${Math.abs(vsFpm)} fpm`, view.width - 62 * u, 392 * u, 13 * u, vsFpm < -900 ? COLORS.hudWarn : COLORS.hudText, 'center');

  // Right-hand gauges: throttle, fuel, hull.
  const gx = view.width - 108 * u;
  gauge(ctx, gx, 430 * u, 92 * u, 13 * u, plane.throttle, 'THROTTLE', '#ffb84e');
  gauge(ctx, gx, 472 * u, 92 * u, 13 * u, state.fuel / SUPPLY.fuelMax, 'FUEL', '#57b6d9', 0.18);
  gauge(ctx, gx, 514 * u, 92 * u, 13 * u, state.hull / SUPPLY.hullMax, 'HULL', COLORS.hudGood, 0.3);
  if (state.refuelling) text(ctx, 'REFUELLING…', gx + 46 * u, 548 * u, 13 * u, COLORS.hudGood, 'center');

  // Score and clock, bottom left.
  panel(ctx, 14 * u, view.height - 86 * u, 190 * u, 70 * u, 9);
  text(ctx, 'SCORE', 26 * u, view.height - 66 * u, 12 * u, COLORS.hudLine);
  text(ctx, String(state.score), 26 * u, view.height - 42 * u, 26 * u, '#ffffff');
  text(ctx, `TIME ${formatTime(state.time)}`, 196 * u, view.height - 42 * u, 15 * u, COLORS.hudText, 'right');

  // Mission progress chips, top left under nothing else.
  panel(ctx, 14 * u, 14 * u, 216 * u, 62 * u, 9);
  const ringText = missions.phase === PHASE_RINGS ? `Rings ${missions.ringIndex}/${missions.rings.length}` : `Rings ${missions.rings.length}/${missions.rings.length} ✓`;
  const cargoText = missions.phase === PHASE_CARGO ? `Cargo ${missions.crateResults.length}/${SORTIE.crateCount} · ${missions.cratesLeft} aboard` : missions.crateResults.length >= SORTIE.crateCount ? 'Cargo delivered ✓' : 'Cargo —';
  text(ctx, ringText, 26 * u, 34 * u, 15 * u, missions.phase === PHASE_RINGS ? '#ffd23e' : COLORS.hudText);
  text(ctx, cargoText, 26 * u, 58 * u, 15 * u, missions.phase === PHASE_CARGO ? '#ffd23e' : COLORS.hudText);

  // Target guidance: bearing arrow and distance, bottom centre.
  const target = currentTarget(missions);
  if (target && state.started) {
    const dx = target.x - plane.x;
    const dz = target.z - plane.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const bearing = Math.atan2(dx, dz);
    let rel = bearing - plane.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const bx = view.cx;
    const by = view.height - 58 * u;
    panel(ctx, bx - 150 * u, by - 26 * u, 300 * u, 52 * u, 10);
    ctx.save();
    ctx.translate(bx - 118 * u, by);
    ctx.rotate(rel);
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(0, -13 * u);
    ctx.lineTo(8 * u, 8 * u);
    ctx.lineTo(0, 3 * u);
    ctx.lineTo(-8 * u, 8 * u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(ctx, target.label, bx - 96 * u, by - 9 * u, 15 * u, '#ffffff');
    const distText = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    const altText = missions.phase === PHASE_RINGS ? ` · ${Math.round(Math.abs(target.y - plane.y))} m ${target.y > plane.y ? 'above' : 'below'}` : '';
    text(ctx, distText + altText, bx - 96 * u, by + 12 * u, 13.5 * u, COLORS.hudLine, 'left', 'normal');
  }

  // The mission banner: what just happened, or what to do next.
  if (missions.message && state.time < missions.messageUntil) {
    ctx.font = `bold ${17 * u}px ${FONT}`;
    const w = ctx.measureText(missions.message).width + 36 * u;
    panel(ctx, view.cx - w / 2, 92 * u, w, 38 * u, 10);
    text(ctx, missions.message, view.cx, 112 * u, 17 * u, '#ffffff', 'center');
  }

  // Warnings that must not be missed.
  if (plane.stalled) {
    if (Math.floor(state.time * 3) % 2 === 0) {
      text(ctx, 'STALL', view.cx, view.cy - 120 * u, 34 * u, COLORS.hudWarn, 'center');
    }
  }
  if (state.fuel <= 0 && state.started) {
    text(ctx, 'ENGINE OUT — GLIDE TO THE STRIP', view.cx, view.cy - 84 * u, 20 * u, COLORS.hudWarn, 'center');
  } else if (state.fuel < 18 && state.started) {
    text(ctx, 'LOW FUEL', view.cx, view.cy - 84 * u, 18 * u, '#ffb84e', 'center');
  }
  if (plane.onGround && !state.started) {
    text(ctx, 'W / Shift — throttle up · ↑ — lift off at 60 kt', view.cx, view.height - 120 * u, 16 * u, COLORS.hudText, 'center');
  }
}

function card(ctx, view, w, h) {
  const x = view.cx - w / 2;
  const y = view.cy - h / 2;
  ctx.fillStyle = 'rgba(6, 18, 30, 0.78)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,220,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return { x, y };
}

/** Title, pause and end-of-sortie cards over the live world. */
export function drawOverlay(ctx, view, world, screen, best) {
  const u = view.height / 720;
  const { state, missions } = world;
  if (screen === 'title') {
    const { x, y } = card(ctx, view, 620 * u, 430 * u);
    text(ctx, 'SKY COURIER', view.cx, y + 62 * u, 54 * u, '#ffd23e', 'center');
    text(ctx, 'One little aeroplane, one coast, three jobs before the fuel runs out.', view.cx, y + 102 * u, 16.5 * u, COLORS.hudText, 'center', 'normal');
    const lines = [
      ['↑ / ↓', 'pitch — climb and dive'],
      ['← / → or A / D', 'bank — turn'],
      ['W / S or Shift / Ctrl', 'throttle'],
      ['Space', 'drop the cargo crate'],
      ['B', 'brake on the ground'],
      ['P', 'pause'],
    ];
    lines.forEach(([key, what], i) => {
      text(ctx, key, x + 70 * u, y + (150 + i * 30) * u, 16 * u, '#ffd23e');
      text(ctx, what, x + 300 * u, y + (150 + i * 30) * u, 16 * u, COLORS.hudText, 'left', 'normal');
    });
    text(ctx, 'Fly the gold rings, drop two crates on the island target, then land at home.', view.cx, y + 352 * u, 15 * u, COLORS.hudLine, 'center', 'normal');
    text(ctx, 'Press SPACE to fly', view.cx, y + 392 * u, 22 * u, '#ffffff', 'center');
    if (best > 0) text(ctx, `Best sortie: ${best}`, view.cx, y + 418 * u, 14 * u, COLORS.hudLine, 'center', 'normal');
  } else if (screen === 'paused') {
    const { y } = card(ctx, view, 420 * u, 170 * u);
    text(ctx, 'PAUSED', view.cx, y + 58 * u, 36 * u, '#ffd23e', 'center');
    text(ctx, 'P or Space to keep flying', view.cx, y + 108 * u, 17 * u, COLORS.hudText, 'center', 'normal');
  } else if (screen === 'over') {
    const { x, y } = card(ctx, view, 560 * u, 400 * u);
    text(ctx, state.success ? 'SORTIE COMPLETE' : 'SORTIE OVER', view.cx, y + 52 * u, 34 * u, state.success ? COLORS.hudGood : COLORS.hudWarn, 'center');
    text(ctx, state.overReason, view.cx, y + 88 * u, 15.5 * u, COLORS.hudText, 'center', 'normal');
    const ringScore = missions.rings.filter((r) => r.passed).length * SORTIE.ringScore;
    const cargoScore = missions.crateResults.reduce((sum, r) => sum + r.score, 0);
    const rows = [
      ['Rings flown', `${missions.rings.filter((r) => r.passed).length} / ${missions.rings.length}`, ringScore],
      ['Cargo delivered', missions.crateResults.map((r) => `${r.dist} m`).join(' · ') || '—', cargoScore],
      ['Landing bonus', state.success ? 'smooth arrival' : '—', state.landingBonus],
      ['Time bonus', formatTime(state.time), state.timeBonus],
    ];
    rows.forEach(([label, detail, pts], i) => {
      const ry = y + (140 + i * 34) * u;
      text(ctx, label, x + 44 * u, ry, 16 * u, COLORS.hudText);
      text(ctx, detail, x + 270 * u, ry, 15 * u, COLORS.hudLine, 'left', 'normal');
      text(ctx, String(pts), x + 516 * u, ry, 16 * u, '#ffffff', 'right');
    });
    ctx.strokeStyle = 'rgba(160,220,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(x + 44 * u, y + 282 * u);
    ctx.lineTo(x + 516 * u, y + 282 * u);
    ctx.stroke();
    text(ctx, 'TOTAL', x + 44 * u, y + 312 * u, 19 * u, '#ffd23e');
    text(ctx, String(state.score), x + 516 * u, y + 312 * u, 24 * u, '#ffd23e', 'right');
    text(ctx, `Best: ${Math.max(best, state.score)}`, view.cx, y + 344 * u, 14 * u, COLORS.hudLine, 'center', 'normal');
    text(ctx, 'Press SPACE to fly again', view.cx, y + 374 * u, 18 * u, '#ffffff', 'center');
  }
}

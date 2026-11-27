// The instruments: airspeed and altitude tapes, a compass strip, a minimap of the
// whole coast, throttle/fuel/hull gauges, a wind arrow, the combo meter, cargo
// pips, the mission banner and the target arrow — everything a pilot reads at a
// glance, drawn as lit glass over the world. Plus the title briefing (the sortie
// enumerated: twelve rings, two drops, the landing), pause and summary cards.
import { COLORS, PLANE, SORTIE, SUPPLY, WORLD } from './config.js';
import { altitudeAboveGround, headingDegrees, stallSpeedNow } from './plane.js';
import { comboMultiplier, currentTarget, nextRingValue, PHASE_CARGO, PHASE_RINGS, PHASE_RETURN } from './missions.js';

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
function tape(ctx, x, y, w, h, value, step, label, format, redBelow = -1) {
  panel(ctx, x, y, w, h, 8);
  const midY = y + h / 2;
  const pxPerUnit = h / (step * 6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();
  // The stall band: red below the current stall speed on the airspeed tape.
  if (redBelow >= 0) {
    const ry = midY - (redBelow - value) * pxPerUnit;
    ctx.fillStyle = 'rgba(255,90,78,0.35)';
    ctx.fillRect(x + 2, ry, w - 4, y + h - ry);
  }
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

/** The wind arrow: direction the wind blows toward, relative to the nose, with knots. */
function windIndicator(ctx, x, y, u, plane, wind) {
  panel(ctx, x, y, 92 * u, 64 * u, 9);
  const cx = x + 26 * u;
  const cy = y + 34 * u;
  const rel = wind.dir - plane.heading;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rel);
  ctx.fillStyle = '#57b6d9';
  ctx.beginPath();
  ctx.moveTo(0, -13 * u);
  ctx.lineTo(6 * u, 6 * u);
  ctx.lineTo(0, 2 * u);
  ctx.lineTo(-6 * u, 6 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // A little aeroplane glyph in the middle so "relative to the nose" reads clearly.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.2 * u, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, 'WIND', x + 46 * u, y + 13 * u, 10.5 * u, COLORS.hudLine, 'center');
  text(ctx, `${Math.round(wind.speed * 1.944)} kt`, x + 62 * u, y + 34 * u, 14 * u, '#ffffff', 'center');
  text(ctx, 'gusting', x + 62 * u, y + 51 * u, 10 * u, COLORS.hudLine, 'center', 'normal');
}

/** The minimap: the whole coast, the course, the drop zone, and you. */
function minimap(ctx, view, world, u) {
  const size = 168 * u;
  const x = view.width - size - 14 * u;
  const y = 14 * u;
  const { terrain, plane, missions } = world;
  panel(ctx, x, y, size, size, 10);
  const scale = (size - 10 * u) / WORLD.size;
  const mx = (wx) => x + 5 * u + (wx + WORLD.size / 2) * scale;
  const mz = (wz) => y + size - 5 * u - (wz + WORLD.size / 2) * scale;

  // Land vs sea, sampled coarsely from the heightfield.
  const cellPx = Math.max(2, Math.floor(size / 34));
  for (let py = 0; py < size - 10 * u; py += cellPx) {
    for (let px = 0; px < size - 10 * u; px += cellPx) {
      const wx = (px / scale) - WORLD.size / 2;
      const wz = WORLD.size / 2 - (py / scale);
      const h = terrain.heightAt(wx, wz);
      ctx.fillStyle = h <= 0.5 ? 'rgba(42,118,168,0.85)' : h > 240 ? 'rgba(242,236,226,0.9)' : 'rgba(106,168,76,0.85)';
      ctx.fillRect(x + 5 * u + px, y + 5 * u + py, cellPx, cellPx);
    }
  }
  // The runway.
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(mx(0) - 1.5, mz(-1750) - 7 * u, 3, 14 * u);
  // Rings: gold for next, teal for waiting, grey for done.
  missions.rings.forEach((ring, i) => {
    ctx.fillStyle = ring.passed ? 'rgba(200,210,220,0.6)' : i === missions.ringIndex ? '#ffd23e' : '#2ee6c8';
    ctx.beginPath();
    ctx.arc(mx(ring.x), mz(ring.z), i === missions.ringIndex ? 3.4 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  });
  // The drop zone.
  ctx.strokeStyle = '#ff7a3e';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(mx(missions.dropZone.x), mz(missions.dropZone.z), 4.5, 0, Math.PI * 2);
  ctx.stroke();
  // You: a white wedge pointing along the heading.
  ctx.save();
  ctx.translate(mx(plane.x), mz(plane.z));
  ctx.rotate(plane.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6 * u);
  ctx.lineTo(4 * u, 5 * u);
  ctx.lineTo(0, 2 * u);
  ctx.lineTo(-4 * u, 5 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, 'MAP', x + size / 2, y + size + 11 * u, 10.5 * u, COLORS.hudLine, 'center');
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

  tape(ctx, 16 * u, 120 * u, 92 * u, 250 * u, knots, 10, 'KT', (v) => String(v), stallSpeedNow(plane) * 1.944);
  tape(ctx, view.width - 108 * u, 120 * u, 92 * u, 250 * u, feet, 100, 'FT AGL', (v) => String(v));
  compass(ctx, view, heading);
  minimap(ctx, view, world, u);

  // Vertical speed, small, under the altimeter.
  const vsFpm = Math.round(plane.vy * 196.85);
  text(
    ctx,
    `${vsFpm >= 0 ? '▲' : '▼'} ${Math.abs(vsFpm)} fpm`,
    view.width - 62 * u,
    392 * u,
    13 * u,
    vsFpm < -900 ? COLORS.hudWarn : COLORS.hudText,
    'center',
  );

  // Right-hand gauges: throttle, fuel, hull, and the flap position.
  const gx = view.width - 108 * u;
  gauge(ctx, gx, 430 * u, 92 * u, 13 * u, plane.throttle, 'THROTTLE', '#ffb84e');
  gauge(ctx, gx, 472 * u, 92 * u, 13 * u, state.fuel / SUPPLY.fuelMax, 'FUEL', '#57b6d9', 0.18);
  gauge(ctx, gx, 514 * u, 92 * u, 13 * u, state.hull / SUPPLY.hullMax, 'HULL', COLORS.hudGood, 0.3);
  text(
    ctx,
    plane.flaps > 0.9 ? 'FLAPS ▼ DOWN' : plane.flaps > 0.1 ? 'FLAPS …' : 'FLAPS ▲ UP',
    gx + 46 * u,
    548 * u,
    12 * u,
    plane.flaps > 0.1 ? '#ffd23e' : COLORS.hudLine,
    'center',
  );
  if (state.refuelling) text(ctx, 'REFUELLING…', gx + 46 * u, 570 * u, 13 * u, COLORS.hudGood, 'center');

  // Wind, under the airspeed tape.
  windIndicator(ctx, 16 * u, 430 * u, u, plane, world.wind);

  // Score and clock, bottom left.
  panel(ctx, 14 * u, view.height - 86 * u, 190 * u, 70 * u, 9);
  text(ctx, 'SCORE', 26 * u, view.height - 66 * u, 12 * u, COLORS.hudLine);
  text(ctx, String(state.score), 26 * u, view.height - 42 * u, 26 * u, '#ffffff');
  text(ctx, `TIME ${formatTime(state.time)}`, 196 * u, view.height - 42 * u, 15 * u, COLORS.hudText, 'right');

  // Mission progress chips, top left: rings, cargo pips, combo.
  panel(ctx, 14 * u, 14 * u, 232 * u, 86 * u, 9);
  const ringText =
    missions.phase === PHASE_RINGS
      ? `Rings ${missions.ringIndex}/${missions.rings.length}`
      : `Rings ${missions.rings.length}/${missions.rings.length} ✓`;
  text(ctx, ringText, 26 * u, 34 * u, 15 * u, missions.phase === PHASE_RINGS ? '#ffd23e' : COLORS.hudText);
  // Cargo pips: a little crate glyph per crate — filled = delivered, hollow = aboard.
  text(ctx, 'Cargo', 26 * u, 58 * u, 15 * u, missions.phase === PHASE_CARGO ? '#ffd23e' : COLORS.hudText);
  for (let i = 0; i < SORTIE.crateCount; i += 1) {
    const px = 96 * u + i * 24 * u;
    const py = 51 * u;
    const delivered = i < missions.crateResults.length;
    ctx.fillStyle = delivered ? COLORS.hudGood : 'rgba(8,20,32,0.75)';
    ctx.strokeStyle = delivered ? COLORS.hudGood : COLORS.hudLine;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(px, py, 17 * u, 14 * u, 3);
    ctx.fill();
    ctx.stroke();
    if (delivered) text(ctx, '✓', px + 8.5 * u, py + 7.5 * u, 11 * u, '#0a1a28', 'center');
  }
  if (missions.crate) text(ctx, 'crate away…', 150 * u, 58 * u, 12 * u, COLORS.hudLine, 'left', 'normal');
  // Combo meter: the multiplier and a bar toward the next step.
  const mult = comboMultiplier(missions);
  text(ctx, `COMBO ×${mult.toFixed(2)}`, 26 * u, 82 * u, 14 * u, missions.combo > 0 ? '#ffd23e' : COLORS.hudLine);
  const comboFrac = Math.min(1, (mult - 1) / (SORTIE.comboMax - 1));
  ctx.fillStyle = 'rgba(8,20,32,0.75)';
  ctx.beginPath();
  ctx.roundRect(128 * u, 76 * u, 104 * u, 10 * u, 3);
  ctx.fill();
  if (comboFrac > 0) {
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.roundRect(129 * u, 77 * u, Math.max(3, 102 * u * comboFrac), 8 * u, 3);
    ctx.fill();
  }

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
    const altText =
      missions.phase === PHASE_RINGS ? ` · ${Math.round(Math.abs(target.y - plane.y))} m ${target.y > plane.y ? 'above' : 'below'}` : '';
    const valueText = missions.phase === PHASE_RINGS ? ` · worth ${nextRingValue(missions)}` : '';
    text(ctx, distText + altText + valueText, bx - 96 * u, by + 12 * u, 13.5 * u, COLORS.hudLine, 'left', 'normal');
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
  if (missions.phase === PHASE_RETURN && !plane.onGround) {
    text(ctx, 'PAPI: 2 white + 2 red = on the glidepath', view.cx, view.height - 120 * u, 14 * u, COLORS.hudLine, 'center', 'normal');
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

/** A letter grade for the finished sortie, from the score. */
function sortieGrade(score) {
  if (score >= 14000) return 'S — Golden Courier';
  if (score >= 11500) return 'A — First Class';
  if (score >= 9000) return 'B — Air Mail';
  if (score >= 6000) return 'C — Parcel Post';
  return 'D — Still Flying';
}

/** Title, pause and end-of-sortie cards over the live world. */
export function drawOverlay(ctx, view, world, screen, best) {
  const u = view.height / 720;
  const { state, missions } = world;
  if (screen === 'title') {
    const { x, y } = card(ctx, view, 660 * u, 500 * u);
    text(ctx, 'SKY COURIER', view.cx, y + 52 * u, 54 * u, '#ffd23e', 'center');
    text(ctx, 'Golden Hour Run — one little aeroplane, one coast, three jobs before dark.', view.cx, y + 90 * u, 16.5 * u, COLORS.hudText, 'center', 'normal');
    // The briefing: the sortie enumerated, so the whole game reads at a glance.
    const brief = [
      ['1 · RING COURSE', `${SORTIE.ringCount} gold rings in two legs — the coast, then the mountain pass. Clean rings build a combo up to ×${SORTIE.comboMax.toFixed(1)}.`],
      ['2 · CARGO DROP', `${SORTIE.crateCount} crates for the island target. The cross on the ground predicts the fall — mind the wind.`],
      ['3 · COME HOME', `Land on the strip for up to ${SORTIE.landingScore} bonus. PAPI lights: 2 white + 2 red is the glidepath.`],
    ];
    brief.forEach(([head, body], i) => {
      const by = y + (128 + i * 52) * u;
      text(ctx, head, x + 44 * u, by, 16 * u, '#ffd23e');
      text(ctx, body, x + 44 * u, by + 22 * u, 13.5 * u, COLORS.hudText, 'left', 'normal');
    });
    const lines = [
      ['↑ / ↓', 'pitch — climb and dive'],
      ['← / → or A / D', 'bank — turn'],
      ['W / S or Shift / Ctrl', 'throttle'],
      ['F', 'flaps — slower stall, draggier'],
      ['Space', 'drop the cargo crate'],
      ['B', 'brake on the ground'],
      ['P', 'pause'],
    ];
    lines.forEach(([key, what], i) => {
      text(ctx, key, x + 44 * u, y + (300 + i * 24) * u, 14.5 * u, '#ffd23e');
      text(ctx, what, x + 300 * u, y + (300 + i * 24) * u, 14.5 * u, COLORS.hudText, 'left', 'normal');
    });
    text(ctx, `Par ${formatTime(SORTIE.parTime)} — faster pays ${SORTIE.timeBonusPerSec}/s. Fuel burns with throttle; the strip refuels you.`, view.cx, y + 482 * u, 13.5 * u, COLORS.hudLine, 'center', 'normal');
    text(ctx, 'Press SPACE to fly', view.cx, y + 458 * u, 22 * u, '#ffffff', 'center');
    if (best > 0) text(ctx, `Best sortie: ${best}`, view.cx, y + 430 * u, 14 * u, COLORS.hudLine, 'center', 'normal');
  } else if (screen === 'paused') {
    const { y } = card(ctx, view, 420 * u, 170 * u);
    text(ctx, 'PAUSED', view.cx, y + 58 * u, 36 * u, '#ffd23e', 'center');
    text(ctx, 'P or Space to keep flying', view.cx, y + 108 * u, 17 * u, COLORS.hudText, 'center', 'normal');
  } else if (screen === 'over') {
    const { x, y } = card(ctx, view, 580 * u, 440 * u);
    text(ctx, state.success ? 'SORTIE COMPLETE' : 'SORTIE OVER', view.cx, y + 48 * u, 34 * u, state.success ? COLORS.hudGood : COLORS.hudWarn, 'center');
    text(ctx, state.overReason, view.cx, y + 82 * u, 15.5 * u, COLORS.hudText, 'center', 'normal');
    const ringsFlown = missions.rings.filter((r) => r.passed).length;
    const ringScore = state.score - missions.crateResults.reduce((sum, r) => sum + r.score, 0) - state.landingBonus - state.timeBonus;
    const cargoScore = missions.crateResults.reduce((sum, r) => sum + r.score, 0);
    const rows = [
      ['Rings flown', `${ringsFlown} / ${missions.rings.length} · best combo ×${comboMultiplier(missions).toFixed(2)}`, ringScore],
      ['Cargo delivered', missions.crateResults.map((r) => `${r.dist} m`).join(' · ') || '—', cargoScore],
      ['Landing bonus', state.success ? 'smooth arrival' : '—', state.landingBonus],
      ['Time bonus', `${formatTime(state.time)} (par ${formatTime(SORTIE.parTime)})`, state.timeBonus],
      ['Hull remaining', `${Math.max(0, Math.round(state.hull))}%`, 0],
    ];
    rows.forEach(([label, detail, pts], i) => {
      const ry = y + (126 + i * 34) * u;
      text(ctx, label, x + 44 * u, ry, 16 * u, COLORS.hudText);
      text(ctx, detail, x + 270 * u, ry, 15 * u, COLORS.hudLine, 'left', 'normal');
      if (pts > 0 || i < 4) text(ctx, String(pts), x + 536 * u, ry, 16 * u, '#ffffff', 'right');
    });
    ctx.strokeStyle = 'rgba(160,220,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(x + 44 * u, y + 306 * u);
    ctx.lineTo(x + 536 * u, y + 306 * u);
    ctx.stroke();
    text(ctx, 'TOTAL', x + 44 * u, y + 334 * u, 19 * u, '#ffd23e');
    text(ctx, String(state.score), x + 536 * u, y + 334 * u, 24 * u, '#ffd23e', 'right');
    if (state.success) text(ctx, `Grade: ${sortieGrade(state.score)}`, view.cx, y + 366 * u, 16 * u, '#ffd23e', 'center');
    text(ctx, `Best: ${Math.max(best, state.score)}`, view.cx, y + 392 * u, 14 * u, COLORS.hudLine, 'center', 'normal');
    text(ctx, 'Press SPACE to fly again', view.cx, y + 418 * u, 18 * u, '#ffffff', 'center');
  }
}

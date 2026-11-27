// Sound: a little piston engine whose note follows the throttle, a chime for each ring
// (pitched up as the combo climbs), a thud for the arrivals you'd rather forget.
// Everything is synthesised; nothing loads. The context wakes on the first input,
// as browsers require, and stays silent until then.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let stallBeepAt = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(g2);
      g2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, at, dur, type = 'sine', gain = 0.16) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function noiseBurst(dur, gain, lowpass) {
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  return {
    /** Call on any user gesture so the context may start. */
    wake() {
      ensure();
    },
    /** Per-frame: the engine note follows throttle and airspeed. */
    update(plane, running) {
      if (!ctx || !engineOsc) return;
      const t = ctx.currentTime;
      const rpm = running ? 0.25 + plane.throttle * 0.75 : 0;
      const freq = 48 + rpm * 105 + plane.speed * 0.22;
      engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + rpm * 900, t, 0.1);
      engineGain.gain.setTargetAtTime(running ? 0.05 + rpm * 0.09 : 0, t, 0.12);
      if (running && plane.stalled && t > stallBeepAt) {
        stallBeepAt = t + 0.55;
        blip(880, t, 0.12, 'square', 0.05);
      }
    },
    /** Ring chime; the combo lifts the pitch a step per clean ring. */
    ring(combo = 0) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const lift = Math.pow(2, Math.min(combo, 8) / 12);
      blip(880 * lift, t, 0.22);
      blip(1318 * lift, t + 0.09, 0.3);
    },
    drop() {
      if (!ensure()) return;
      blip(392, ctx.currentTime, 0.18, 'triangle', 0.12);
    },
    crateDown(good) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noiseBurst(0.16, 0.1, 500);
      if (good) {
        blip(659, t + 0.05, 0.2);
        blip(988, t + 0.16, 0.32);
      }
    },
    touchdown(hard) {
      if (!ensure()) return;
      noiseBurst(hard ? 0.4 : 0.18, hard ? 0.3 : 0.12, hard ? 300 : 600);
    },
    crash() {
      if (!ensure()) return;
      noiseBurst(0.9, 0.4, 240);
      blip(70, ctx.currentTime, 0.7, 'sawtooth', 0.2);
    },
    success() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => blip(f, t + i * 0.13, 0.34, 'triangle', 0.14));
    },
    refuelled() {
      if (!ensure()) return;
      blip(740, ctx.currentTime, 0.16, 'sine', 0.1);
    },
    /** The flap servo: a short mechanical whir as the panels travel. */
    flaps() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      blip(220, t, 0.28, 'triangle', 0.07);
      blip(185, t + 0.1, 0.24, 'triangle', 0.06);
    },
    /** A flat buzz when the combo chain breaks. */
    comboLost() {
      if (!ensure()) return;
      blip(196, ctx.currentTime, 0.22, 'square', 0.06);
    },
  };
}

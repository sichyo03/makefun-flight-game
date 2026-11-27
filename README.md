# Sky Courier — Golden Hour Run (Best Flight Game)

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/sichyo03/makefun-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/sichyo03/makefun-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A little courier aeroplane, one golden-hour coast, and three jobs before dark.
Fly the **twelve-ring course** in two legs (the coast, then the mountain pass)
building a **combo multiplier** up to ×3, drop **two cargo crates** on the island
target with a **bomb-sight** that predicts the fall, then bring her home to the
strip on the **PAPI lights** — gently, if you want the landing bonus.

## How to play

Open `game/index.html` in a desktop browser — no server, no network, no build
step. Everything is drawn on canvas with original flat art (a flat-shaded 3D
heightfield coast at golden hour, chase view), and all sound is synthesised with
WebAudio (no audio files): the engine note follows your throttle, and the ring
chime rises in pitch as your combo climbs.

- **Pitch:** ↑ / ↓ (climb and dive). **Bank:** ← / → or A / D (turn).
- **Throttle:** W / S or Shift / Ctrl (or the mouse wheel). **Flaps:** F.
- **Drop cargo:** Space. **Brake:** B (on the ground). **Pause:** P. **Restart:** R.

The wing is honest: climb too steep at low speed and she stalls — nose drops,
controls go mushy, the warning sounds, and the airspeed tape shows the red stall
band. Flaps lower the stall speed for a slower approach but drag you down.
Banked turns cost speed. A gusting sea breeze pushes the airframe sideways, so
headings need crabbing — the windsock by the strip and the HUD wind arrow tell
you which way. Fuel burns with the throttle, so a flat-out sortie is a short
one; land and stop on the runway to refuel. Hard arrivals bend the gear (watch
the hull gauge), wingtip vapour trails off in hard turns, smoke trails when the
hull is hurt, and the sea or a hillside ends the sortie at once. The final
landing is graded on smoothness, finishing under par pays a time bonus, and the
summary card grades the sortie from D to S.

The HUD shows airspeed and altitude tapes (with the stall band), a compass
strip, vertical speed, throttle / fuel / hull gauges, flap position, a wind
arrow in knots, a **minimap** of the whole coast with the course and drop zone,
cargo pips, the combo meter, score popups where points are earned, and a
bearing arrow to the next job with its distance, height offset and ring value.

## Files

- `game/index.html` — the page shell (canvas + status line).
- `game/src/config.js` — world, aeroplane, wind, sortie and palette constants.
- `game/src/rng.js` — seeded sfc32 RNG and value noise (same seed, same coast).
- `game/src/terrain.js` — the heightfield coast, northern range, runway apron,
  drop-zone plateau, harbour town plots, windsock and lighthouse spots.
- `game/src/plane.js` — the flight model: lift, stall, flaps, banked turns,
  wind drift and crab correction, landings.
- `game/src/missions.js` — twelve-ring combo course, cargo drops with a
  landing predictor (the bomb-sight), the return home.
- `game/src/world.js` — sortie state: fuel, hull, score, clock, particles,
  score popups, drifting clouds, boats, gulls.
- `game/src/input.js` — keyboard, pointer and mouse-wheel controls.
- `game/src/audio.js` — WebAudio engine hum, combo chimes, flap servo, thuds,
  stall warning.
- `game/src/render.js` — 3D projection, golden-hour sky and sun glint, terrain,
  runway with PAPI and approach sequencer, numbered rings, town, lighthouse
  beam, boats, birds, bomb-sight, the aeroplane with flaps and nav lights.
- `game/src/hud.js` — instruments, compass, minimap, wind arrow, combo meter,
  cargo pips, banners, briefing and summary cards.
- `game/src/shots.js` — autopilot-staged scenes for the screenshots.
- `game/src/main.js` — boot, game loop, screens, sounds.
- `main.ts` — copies `game/` and `screenshots/` to the output and writes
  `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.
- `vendor/makefun-game.ts` — the kit's dossier builder, unchanged.
- `screenshots/` — four real renders (cover, title briefing, ring course,
  final approach).

## Screenshots

1. `1-cover.png` — airborne over the coast at golden hour, first gold ring
   ahead, full HUD with minimap, wind and combo.
2. `2-title.png` — the briefing card over the parked aeroplane: the three jobs
   enumerated, controls, par time.
3. `3-rings.png` — mid-course in the mountain leg, combo building, numbered
   rings ahead.
4. `4-landing.png` — on final approach with flaps down, PAPI lights and the
   approach sequencer lit, cargo delivered.

Verified headlessly before hand-in: a scripted autopilot flies the whole
sortie (takeoff, all 12 rings with a full combo chain, both crates, a
touchdown on the strip) plus stall, flaps, wind-drift, refuel and
same-seed-determinism checks — 15/15 pass.

---

Built for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). If you build something here too, my referral code is `p3gwn12d`.

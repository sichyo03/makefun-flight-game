# Sky Courier — Best Flight Game

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/sichyo03/makefun-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/sichyo03/makefun-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A little courier aeroplane, one sunlit coast, and three jobs before the fuel
runs out. Fly the gold ring course around the islands, drop two cargo crates
on the island target, then bring her home to the strip — gently, if you want
the landing bonus.

## How to play

Open `game/index.html` in a desktop browser — no server, no network, no build
step. Everything is drawn on canvas with original flat art (a flat-shaded 3D
heightfield coast, chase view), and all sound is synthesised with WebAudio
(no audio files): the engine note follows your throttle.

- **Pitch:** ↑ / ↓ (climb and dive). **Bank:** ← / → or A / D (turn).
- **Throttle:** W / S or Shift / Ctrl. **Drop cargo:** Space.
- **Brake:** B (on the ground). **Pause:** P. **Restart:** R.

The wing is honest: climb too steep at low speed and she stalls — nose drops,
controls go mushy, the warning sounds. Banked turns cost speed. Fuel burns
with the throttle, so a flat-out sortie is a short one; land and stop on the
runway to refuel. Hard arrivals bend the gear (watch the hull gauge), and the
sea or a hillside ends the sortie at once. The final landing is graded on
smoothness, and finishing under par pays a time bonus.

The HUD shows airspeed and altitude tapes, a compass strip, vertical speed,
throttle / fuel / hull gauges, and a bearing arrow to the next job.

## Files

- `game/index.html` — the page shell (canvas + status line).
- `game/src/config.js` — world, aeroplane, sortie and palette constants.
- `game/src/random.js` — seeded RNG and value noise (same seed, same coast).
- `game/src/terrain.js` — the heightfield coast, runway apron, drop-zone island.
- `game/src/plane.js` — the flight model: lift, stall, banked turns, landings.
- `game/src/missions.js` — ring course, cargo drops, the return home.
- `game/src/world.js` — sortie state: fuel, hull, score, clock, particles.
- `game/src/input.js` — keyboard + pointer controls.
- `game/src/audio.js` — WebAudio engine hum, chimes, thuds, stall warning.
- `game/src/render.js` — 3D projection, terrain, rings, runway, the aeroplane.
- `game/src/hud.js` — instruments, compass, gauges, banners, summary cards.
- `game/src/shots.js` — autopilot-staged scenes for the screenshots.
- `game/src/main.js` — boot, game loop, screens, sounds.
- `main.ts` — copies `game/` and `screenshots/` to the output and writes
  `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.
- `vendor/makefun-game.ts` — the kit's dossier builder, unchanged.
- `screenshots/` — four real renders (cover, ring course, final approach, cargo drop).

## Screenshots

1. `1-cover.png` — airborne over the coast, first gold ring ahead, full HUD.
2. `2-rings.png` — mid-course, two rings cleared, closing on the third.
3. `3-landing.png` — on final approach to the home runway.
4. `4-cargo.png` — a crate under its parachute, falling toward the island target.

---

Built for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). If you build something here too, my referral code is `p3gwn12d`.

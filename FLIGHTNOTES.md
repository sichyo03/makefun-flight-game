# Sky Courier — design and flight-model notes

Working notes for the game as built. Kept so the reasoning behind the
numbers survives even when the constants in `config.js` change.

## Overview

Sky Courier is a chase-view flight game over a golden-hour coast,
rendered on a single canvas. The player flies one sortie built from
three jobs in a fixed order: a ring course, two parachute cargo
drops, and a landing. Everything is deterministic — the world is
seeded (sfc32), the flight model integrates at a fixed step, and the
same seed plus the same inputs reproduce the same flight, which is
what makes the headless play-test meaningful.

The tone target is "relaxed but readable": the scene is warm and
unhurried, but every system that affects the score — wind, combo,
fuel, glidepath — is visible on the HUD rather than hidden in the
model, so a lost point is always explainable after the fact.

## The three jobs

1. **Ring course.** Twelve numbered rings in two legs. The first leg
   follows the coast at low altitude; the second climbs into a
   mountain pass over the northern range, so the player has to manage
   energy rather than just steer. Rings must be taken in order — the
   target label always names the next ring.
2. **Cargo drops.** Two parachute crates, released over a marked
   drop zone near the harbour. Score per crate depends on how close
   to the zone centre the crate settles, not where it was released.
3. **Landing.** Bring the plane back to the strip and put it down
   for a bonus. A gentle touchdown with a low sink rate pays most;
   a heavy arrival still completes the sortie but pays less.

Par time for the full sortie is **6:20**. The summary card converts
score, time, and hull state into a letter grade from **S ("Golden
Courier")** down to **D**. Grades are deliberately forgiving at the
bottom — finishing at all is worth more than finishing pretty — and
stingy at the top, where S needs a clean ring chain, both crates
near the centre, and a soft landing.

## Flight model

The model is arcade, but it keeps the three relationships that make
flying feel like flying:

- **Lift scales with airspeed.** Below the stall speed the wing
  stops holding the plane up and it sinks, nose dropping as it does.
  The airspeed tape carries a stall band so the player can see the
  margin closing before the sink starts.
- **Thrust fights drag, and drag grows with speed.** Full throttle
  climbs and accelerates; throttling back settles into a cruise.
  Mouse-wheel throttle trim exists because holding a key for fine
  adjustments felt clumsy in testing.
- **Turns cost energy.** Banked flight bleeds speed, so carving
  around a ring late usually means arriving at the next one slow.
  The mountain leg punishes this on purpose.

The chase camera sits behind and slightly above the airframe, with
the horizon kept level; the plane sprite banks and pitches within
the frame instead of the world rolling, which keeps the HUD readable
and avoids motion sickness in a small window.

## Wind

A gusting sea breeze blows across the course. It is a first-class
system, not decoration:

- The airframe drifts with the wind. The flight model applies a
  **crab correction**: the plane's ground track is the sum of its
  heading velocity and the wind vector, so the player has to point
  slightly into the wind to fly a straight line over the ground.
- Cargo canopies drift too, by more than the plane does — a crate
  released exactly over the zone will land downwind of it.
- Gusts vary over time on a slow cycle, so the wind at the first
  ring is not the wind at the drop zone.

The player reads the wind four ways: a HUD arrow with speed in
**knots**, a windsock by the strip that swings and stiffens with
the gusts, clouds drifting at wind speed, and the crab angle itself
visible against the terrain. In the play-test, ten seconds of
hands-off flight in the standard breeze produced **52 m of eastward
drift** — enough to matter for a drop, not enough to make the ring
course a fight.

## Rings and combo

Each ring has a value shown in the target label ("worth 875"), so
the player always knows what a clean pass pays. Crossing a ring
through its middle is a **clean** crossing; crossing near the rim is
**wide**. Both count the ring, but only clean crossings build the
combo:

- Consecutive clean crossings raise a multiplier from **×1 to ×3**.
- A wide crossing **breaks the chain** back to ×1.
- The ring chime **rises in pitch** with each link in the chain, so
  the multiplier is audible without looking at the meter.
- Milestone popups mark chain lengths (×2, ×3, and every few clean
  rings after that) where the points were earned.

The design intent: the combo rewards flying the course well rather
than merely finishing it, and the pitch ladder gives that reward a
rhythm. A perfect course is a 12-link chain; the play-test autopilot
achieves exactly that, which set the S-grade threshold.

## Cargo and the bomb-sight

Two crates, shown as pips on the HUD so the player never has to
remember how many are left. A released crate falls under a canopy:
it descends at a fixed rate, inherits the plane's velocity at
release, then drifts with the wind as the canopy takes over.

Because wind drift makes "release over the target" wrong by a
visible margin, the game provides a **bomb-sight**: a predicted
landing cross with a dotted fall line, recomputed every frame from
current altitude, airspeed, and wind. The cross turns **green** when
the prediction sits inside the drop zone. The prediction is honest —
it integrates the same fall model the crate uses — so a green cross
released immediately really does land in the zone, and the skill
moves from guessing to timing the release.

Scoring falls off with distance from the zone centre. In the
play-test the two crates scored **540 and 548 points**, close to the
per-crate ceiling, using green-cross releases.

## Landing aids

The strip is short, so the final approach gets real aids, borrowed
from light airfields:

- **PAPI lights** beside the threshold: two white over two red
  means on glidepath; more red means low, more white means high.
- An approach sequencer — the **"rabbit"** — a line of lights that
  flash in sequence toward the threshold, pulling the eye along the
  approach path.
- A **PAPI hint** in text on final ("on glidepath", "too low",
  "too high") for players who have not yet learned to read the
  lights.

Touchdown quality is scored on sink rate and alignment. Ditching in
the water ends the sortie immediately — the play-test covers this
case explicitly, because an earlier build let a ditched plane taxi
across the harbour, which was funny exactly once.

## World dressing

The coast is dressed to be read as a place, and to give the player
landmarks for navigation:

- A **harbour town of 46 houses** along the waterfront, warm-lit
  against the evening.
- A **lighthouse with a rotating beam** on the point — the beam is
  also a useful bearing reference on the way home.
- **7 fishing boats** with wakes, moving slowly along the shore.
- **14 gulls** circling over the harbour.
- **Sun glint** on the water and warm-lit clouds for the
  golden-hour look.

None of it is simulated beyond its motion; the counts are chosen so
the scene reads as busy from chase-view distance without costing
frame time. All of it is seeded, so the town is the same town every
run.

## Feedback and sound

Every scoring event announces itself where it happens:

- **Score popups** at the point of earning (ring, crate, touchdown).
- **Wingtip vapour trails** in hard turns, so energy bleed is
  visible as well as felt.
- The **stall band** on the airspeed tape, plus buffet as the stall
  arrives.
- Ring values in the target label and cargo pips on the HUD, so the
  next decision is never a memory test.

Sound is synthesized, no samples: engine tone tied to throttle, the
pitch-ladder ring chime, a servo whir when the flaps move, and a
soft thump for crate touchdown. The flap servo matters — flaps are
a control the player toggles while busy, and the whir confirms the
toggle without a glance at the indicator.

## Balance notes

**Fuel is the main balancing lever.** The tank is **280 units**.
An earlier 220-unit tank worked on the eight-ring course but ran
dry just before landing once the course grew to twelve rings with a
mountain leg — the failure was found by the play-test, not by feel.
At 280, a careful cruise finishes with margin, while flying flat-out
the whole way still forces a **refuel stop** on the strip (touch
down, roll to the pumps, take off again). That split is the point:
speed is available, but it is not free.

Other numbers worth recording:

- **Flaps** lower the stall speed enough to fly at **20 m/s**, at
  the cost of extra drag — they are for the approach and for tight
  ring work, not for cruise. The sprite shows droop panels when
  they are down, and the HUD shows a FLAPS indicator.
- The combo ceiling of ×3 keeps a perfect ring course from dwarfing
  the cargo and landing scores; all three jobs have to go well for
  an S.
- Par 6:20 assumes one refuel stop is *not* needed; a refuel stop
  costs roughly forty seconds and usually drops the grade a letter,
  which is the intended trade for flat-out flying.

## Play-test

A headless autopilot (`playtest.mjs`) flies the sortie on a fixed
seed and asserts **15 checks, all passing**:

- takeoff and climb;
- stall behaviour (the plane sinks below stall speed);
- flaps holding flight at 20 m/s;
- wind drift of 52 m east in 10 s;
- all 12 rings taken, best combo chain 12;
- both crates delivered, 540 + 548 points;
- sortie completes with a landing — bonus 899, total score
  **15,487**, hull 100%;
- ditching ends the sortie;
- refuel on the strip, 40 → 144 units;
- same-seed determinism (two runs, identical state).

The autopilot is not a good pilot — it flies the numbers, not the
scene — but that is what makes it useful: if a change breaks the
flight model, the fuel balance, or the scoring, a check goes red
before a human ever sees the build.

## Code structure

Thirteen single-job modules under `game/src/`, plus `index.html`:

| Module | Job |
|---|---|
| `audio.js` | synthesized engine, chime, servo, thumps |
| `config.js` | every tunable constant in one place |
| `hud.js` | tapes, wind arrow, combo meter, pips, minimap |
| `input.js` | keys, mouse-wheel throttle trim |
| `main.js` | game loop and state machine |
| `missions.js` | ring course, drops, landing, grading |
| `plane.js` | flight model, flaps, crab correction |
| `render.js` | canvas drawing, chase camera |
| `rng.js` | sfc32 seeded generator |
| `shots.js` | screenshot capture hooks for the dossier |
| `terrain.js` | coast and mountain heightfield |
| `world.js` | town, lighthouse, boats, gulls, clouds |

`main.ts` at the entry root builds the dossier from the game files
and screenshots. There are **no external references** — no fonts, no
images, no libraries; everything on screen is drawn by the canvas
renderer from the seeded world. That constraint is what keeps the
game a single self-contained bundle and the play-test honest: what
runs in the test is exactly what runs in the browser.

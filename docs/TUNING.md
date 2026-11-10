# Tuning and measurement

Two tools decide how this game feels: a live panel for finding a feel by hand, and a
headless harness for proving it with numbers. Both matter — the panel answers "does this
feel right?", the harness answers "is this actually true?"

## The live panel

Press `` ` `` or click **⚙ Tune**, bottom right.

Every number that shapes feel lives in `sim/tuning.ts` as a single mutable `T` object,
with a `TUNING_SCHEMA` describing each field for the UI. Nothing hardcodes a feel constant
anywhere else, so the panel is authoritative over the whole fleet — moving a slider moves
it for the player and every enemy at once.

Groups: **Hull & drive**, **Steering**, **Rigging**, **Weather**, **Gunnery**,
**The run**, **Enemy captains**, **Presentation**.

### The polar curve editor

The polar curve gets a dedicated editor with draggable control points, because it is the
most important thing to tune and the hardest to get right by typing numbers at it. Points
move vertically only — angles stay fixed so the shape stays readable.

### The refit bench

The top section of the panel grants or strips any upgrade mid-run, so a card can be
*felt* rather than reasoned about. Each row shows stacks held against max, with − and +
buttons, plus four bulk actions:

| Button | Does |
|---|---|
| **All +1** | One stack of everything |
| **Max all** | Every line to its ceiling |
| **Strip** | Back to a stock hull |
| **Level up** | Tops up plunder to trigger the next draft immediately |

A live **shot lands — hull / rig / crew** readout sits above the rows, because the three
shot types trade against each other rather than adding, and the resulting split is the
only way to see what a combination actually does.

Changes call `World.rebuildPlayerMods()`, which recomputes modifiers from scratch: stock
hull, then baseline repair, then every upgrade held. Upgrades apply multiplicatively, so
there is no way to un-apply a single one — removing a stack means rebuilding the whole
set. That method is also the natural home for a respec if one is ever added.

The bench deliberately **ignores shot exclusivity** so the three types can be compared
directly. Holding one still locks the draft, exactly as drafting it would.

### Persistence

Settings persist to `localStorage`, and **only parameters you have actually moved are
saved**. Everything else follows the code defaults.

This matters more than it sounds. The first implementation persisted the entire `T`
object, so once you touched any slider every value was pinned and subsequent changes to
defaults in `tuning.ts` became invisible — code changes appeared to do nothing.

**Copy JSON** exports your preset so a good feel can be committed back into
`sim/tuning.ts` as the new defaults. **Reset all** clears everything.

## The headless harness

`window.__game` exposes `{ world, camera, loop, input, audio }`. This is how the
simulation gets driven and regression-checked from the browser console without a human at
the helm, and it is how every measured table in these docs was produced.

### The versioned harness

`src/dev/testPilot.ts` holds the scripted captain and a benchmark runner, exposed on the
debug hook:

```js
window.__game.benchmark(16)      // 16 seeds, returns win rate, median, levels, aground %
window.__game.simulateRun(3)     // one seed, detailed
```

Results are **reproducible**: the same seed replays exactly, and two consecutive
benchmarks return identical figures. That was not true until recently — the wind was
never reset between runs — so figures quoted earlier in this project's history carry more
noise than they appear to.

It lives in the repository rather than in a console snippet because every balance figure
in these docs came out of it. A pilot that drifts between measurements makes the numbers
incomparable — which happened once already, when a mid-comparison edit produced two
"before and after" figures that were not measuring the same thing.

The pilot holds the enemy abeam, breaks off downwind when badly hurt, sweeps nearby
plunder, never pinches, and avoids land. Watch `avgAgroundPercent` in the result: if it
climbs, the pilot is measuring its own incompetence rather than the game.

### Basic shape

```js
const { world, loop } = window.__game
loop.stop()                    // free the main thread; no rendering

world.reset(seed)              // deterministic: same seed, same run
const dt = 1/120
for (let i = 0; i < 60 * 120; i++) {
  world.drainSunk()            // stand in for the audio consumer
  world.steerInput = /* your pilot */
  world.step(dt)
}
console.log(world.player.hull, world.run.level)
```

`World` owns a seeded PRNG and the wind uses seeded noise, so a run is reproducible.

### A scripted pilot

The pilot used for most balance measurements holds the enemy abeam (to keep a broadside
bearing) and refuses to steer inside the no-go zone:

```js
const diff = (a, b) => { let d = (a-b) % (Math.PI*2)
  if (d > Math.PI) d -= Math.PI*2
  if (d < -Math.PI) d += Math.PI*2
  return d }

const pilot = (w) => {
  const p = w.player
  let best = Infinity, target = null
  for (const e of w.enemies) {
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)
    if (d < best) { best = d; target = e }
  }
  if (!target) return
  const bearing = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x)
  const port = bearing + Math.PI/2, stbd = bearing - Math.PI/2
  let want = Math.abs(diff(port, p.heading)) < Math.abs(diff(stbd, p.heading)) ? port : stbd
  // never pinch
  const off = diff(want, w.wind.from)
  if (Math.abs(off) < 55*Math.PI/180) want = w.wind.from + Math.sign(off || 1) * 55*Math.PI/180
  w.steerInput = Math.max(-1, Math.min(1, diff(want, p.heading) * 1.8))
}
```

### Freezing variables

To measure one thing, hold the rest still:

```js
// Fix the weather
world.wind.step = () => { world.wind.from = 0; world.wind.strength = 1 }

// Stop the run clock and the spawn director
world.run.tick = () => false

// Remove self-repair so a duel measures pure combat
world.player.mods.hullRepair = 0
world.player.mods.sailRepair = 0

// Isolate a specific matchup
world.ships.length = 1              // keep only the player
world.spawnWave(1, someShipClass)
```

### Useful measurements

**Terminal speed at a given point of sail** — hold a heading and let drag settle:

```js
s.heading = awaDeg * Math.PI/180   // re-set every step; we want speed, not a turn
s.step(dt, world.wind, 0)
// ... after ~100 simulated seconds, read s.forwardSpeed
```

**Turning circle** — settle on course, then hold full helm and average the radius of the
path actually carved. **Tack cost** — settle, put the helm over, record the minimum
forward speed and the time to reach the opposite heading.

## Pitfalls

Every one of these cost real time.

**Dynamic imports give you a different module instance.** `await import('/src/sim/tuning.ts')`
in the console returns a *fresh* module whose `T` is not the one the running app uses.
Mutating it does nothing. Work through `window.__game` instead, or scale via `ship.mods`,
which demonstrably reaches the live physics. Plain data like `ENEMY_CLASSES` is safe to
import, because only its field values are read.

**`array.map(fn)` passes the index as the second argument.** `['a','b','c'].map(duel)`
calls `duel('a', 0, [...])` — which silently became a 0-second time limit and produced a
table of nonsense. Use `.map(x => duel(x))`.

**Long runs freeze the renderer.** 216,000 simulation steps in one console call will time
out. Either `loop.stop()` first, or slice the work across several calls.

**Do not let the renderer own simulation state.** The `justSunk` list was originally
cleared only by the render loop, so running headless re-counted the same wrecks every
step — 5,919 ships sunk in 60 seconds. If a measurement produces an absurd number,
suspect a broken dependency before suspecting the balance.

**`loop.timeScale` is re-asserted every frame.** `main.ts` recomputes it from pause, draft
and run state on each render, so setting it from the console does nothing — the simulation
keeps running and whatever you were trying to inspect flies away. Use `loop.stop()` for
headless work, or press `P` to freeze a scene for a screenshot.

**Give the measurement bot every capability the *player* has — this keeps recurring.**
Three times now a mechanic has measured as weak because the pilot could not use it: land
avoidance (terrain looked like it halved the win rate), heaving to (unmeasurable, since
the bot never engineers sea room), and chasing a trader. The last is the clearest case —
the pilot engaged whatever was nearest, so two Fluyts a run sailed off untouched under
every build, and chain shot's entire purpose went unmeasured. Teaching it to give chase
moved chain from behind grape to ahead of it **without changing a single balance number**.
Before concluding that a mechanic is weak, check that the proxy can actually perform the
play the mechanic exists to enable.

**Give the measurement bot every capability the AI has.** Adding land avoidance to the
enemy captains but not to the test pilot made terrain look like it halved the win rate
(50% → 13%). It had not; the pilot was simply aground 18% of the time. A proxy missing a
skill the real player has will report that skill's absence as difficulty.

**Check reproducibility before trusting a comparison.** Run the same seed twice. If it
diverges, something stateful is not being reset, or two systems are sharing a PRNG stream
— and every number you are about to compare is noise.

*Corollary, learned the hard way again during the reef work:* when two runs of "the same"
build disagree, suspect the build before the simulation. A patch that edited one of two
copies of an avoidance routine looked exactly like nondeterminism until the same bundle
was run twice and matched.

**Twenty-four seeds is not enough for a median.** A Pinnace measured 345s against 430s on
the same code, two batches apart, purely on seed draw. Thirty-two is the floor for any
number that gets written down, and a difference under ~20s should not be reported as a
difference at all.

**A feel change can be a balance change.** Staggering the guns was asked for as a
presentation tweak and cut the win rate nearly in half, because it quietly made every
broadside less accurate. Benchmark after anything that touches timing.

**Re-measure after retuning.** The ship class tables in [COMBAT.md](COMBAT.md) moved
substantially when gunnery changed in Phase 3. Stale measurements presented as current
are worse than no measurements.

## Methodology notes

- **Measure before theorising.** The "ships barely engage" finding (19% of a duel spent
  in gun range) redirected an entire tuning pass that would otherwise have gone into
  damage numbers, which were never the problem.
- **Watch for coupled curves.** Softening the spawn rate also slowed the draft, because
  fewer enemies means less plunder. Levers in this game are rarely independent.
- **A crude bot is a floor, not a verdict.** It never disengages, never prioritises, and
  drafts from a fixed list. If it clears something, a human certainly can; if it fails,
  that is weaker evidence.

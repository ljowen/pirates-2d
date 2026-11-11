# Architecture

## The one rule

**`src/sim/` knows nothing about rendering, audio or UI.** Nothing in it imports from
`render/`, `audio/` or `ui/`. Everything downstream observes simulation state and reacts.

This is not purity for its own sake. It is what makes the headless measurement harness
possible (see [TUNING.md](TUNING.md)) — balance is decided by running thousands of
simulated seconds with no renderer attached, which only works if the simulation is
self-sufficient. It also caught a real bug: see *Event lifecycle* below.

## Fixed timestep

`core/loop.ts` runs the simulation at a fixed 120 Hz, decoupled from rendering, and hands
the renderer an interpolation alpha so motion stays smooth between steps.

```
frame → accumulate real time → step(1/120) × N → render(alpha, frameDt)
```

Why it matters:

- Sailing physics behave identically regardless of display refresh rate. A feel tuned on
  a 60 Hz laptop is the same feel on a 144 Hz monitor.
- Catch-up steps are clamped at 240 so an alt-tab pause cannot spiral.
- `timeScale` drives pause (0), turbo (4) and the draft freeze from one place.

Ships keep `prevPos` / `prevHeading` / `prevHeel` so the renderer can interpolate.

## Layers

```
       ┌──────────────────────────────────────────┐
       │  sim/   world, ship, wind, polar,        │   no outward dependencies
       │         combat, ai, director, run,       │
       │         upgrades, plunder, tuning        │
       └──────────────────────────────────────────┘
            ▲            ▲             ▲
            │ observes   │ observes    │ observes
       ┌────┴─────┐ ┌────┴─────┐ ┌─────┴────┐
       │ render/  │ │ audio/   │ │ ui/      │
       └──────────┘ └──────────┘ └──────────┘
```

`main.ts` owns the loop and wires the layers together. It is the only file that knows
about all four.

### Module responsibilities

**`core/`**
| File | Responsibility |
|---|---|
| `loop.ts` | Fixed-timestep accumulator, time scaling |
| `input.ts` | Keyboard and mouse, edge-triggered presses |
| `math.ts` | Angles, damping, clamping, compass conversion |
| `noise.ts` | Seeded value noise — wind drift and gusts |
| `rng.ts` | Seeded PRNG (mulberry32) — reproducible runs |

**`sim/`**
| File | Responsibility |
|---|---|
| `world.ts` | Owns everything; the single `step(dt)` entry point |
| `ship.ts` | Hull physics, condition, the `ShipMods` upgrade surface |
| `wind.ts` | Persistent wandering wind, direction and strength |
| `weather.ts` | Squalls: cells that make up to windward, cross, and blow out. Sampled through `wind.at` |
| `polar.ts` | The speed-vs-angle curve, as an editable table |
| `combat.ts` | Gun batteries, shot, hit resolution, damage split |
| `ai.ts` | Enemy captains — same physics, same wind |
| `shipClasses.ts` | Hull definitions (Pinnace, Barque, Brigantine, Sloop) |
| `director.ts` | What the sea throws at you and when |
| `run.ts` | Clock, levels, draft state, win/loss |
| `upgrades.ts` | The draft pool and weighted drawing |
| `stats.ts` | Derived, player-facing stats — the same arithmetic the physics runs, solved rather than simulated |
| `plunder.ts` | Spoils, drift, magnet, collection |
| `terrain.ts` | Islands and bars from a hashed grid; the shoreline and reef fields physics and rendering share |
| `tuning.ts` | Every number that shapes feel, plus its UI schema |

**`render/`** — `camera`, `water`, `shipView`, `wake`, `combatView`, `plunderView`,
`terrainView`, `squallView`, `pickupText`, `hud`, `debug`, plus three files that exist to
keep the art in one place: `palette` (every colour, by role), `hullStyle` (how a hull and
its canvas are painted), `rig` (where every yard and sail *is*, with no opinion on how it
looks), and `painter` (the drawing surface, as an interface). `scripts/buildSheet.ts`
paints through that interface into SVG, which is how `docs/sprite-sheet.svg` is generated
at build time from the same code the game runs rather than from a second copy of it. Pixi draws the world; a plain 2D canvas overlay draws every instrument,
because text, arcs and plots are far easier in Canvas2D than in a scene graph.

**`audio/`** — `audio.ts` is a procedural synthesiser; `director.ts` watches simulation
state and decides what to play. See [AUDIO.md](AUDIO.md).

**`dev/`** — `testPilot.ts`, a scripted captain and benchmark harness. Versioned rather
than kept as a console snippet because every balance figure in these docs came out of it,
and a pilot that drifts between measurements makes the numbers incomparable.
`scripts/bench.ts` runs it headless under Node (`npm run bench`).

**`meta/`** — what outlives a run. `career.ts` holds the save, the payout and the ledger;
`feats.ts` the things done at sea that open things ashore. It sits *around* the
simulation and never inside it: a career is boiled down to a `Voyage` (`sim/voyage.ts` —
refit ranks, notoriety, earned cards) before a run starts, and read again only when it
ends. A run is a function of `(seed, hull, voyage)`, which is what lets the harness
measure any career it is handed.

**`ui/`** — `tuner.ts` (live parameter panel), `draft.ts` (level-up cards and the stat
preview under them) and `port.ts` (shipyard, refits and the captain's log). All DOM overlays rather than
canvas, because they want hover states, scrolling and readable body text.

## Key seams

### Tuning: one global, authoritative

`sim/tuning.ts` exports a single mutable `T` object plus a `TUNING_SCHEMA` describing
every field for the UI. Nothing hardcodes a feel constant anywhere else. The tuning panel
edits `T` live; the headless harness can set `T` directly.

### `ShipClass` vs `ShipMods`

Two distinct ideas that are easy to conflate:

- **`ShipClass`** — *the hull you are sailing.* Relative multipliers on the tuning
  baseline, plus colours and scale. Pinnace, Barque, Brigantine, Sloop.
- **`ShipMods`** — *upgrades layered on top.* All 1.0 on a stock ship.

```
effective stat = tuning baseline × class × mods
```

This keeps the tuner authoritative over the whole fleet (a slider moves everyone), lets a
class make only relative claims, and gives the draft a surface to edit that never touches
physics. Every upgrade in `upgrades.ts` does nothing but mutate `ShipMods`.

### Event lifecycle

The simulation must never depend on an external consumer draining its events — a renderer
can skip frames, and a headless run has no renderer at all.

- **Internal accounting** uses a step-local list. `World.step` builds `sunkThisStep` and
  uses it immediately for plunder drops and the sunk counter.
- **External consumers** call `world.drainSunk()`, which returns everything since the last
  call and clears. Safe to skip frames.

> This was a real bug. `justSunk` was originally cleared only by the renderer, so with
> rendering stopped the simulation re-counted the same wrecks every step and re-dropped
> their plunder — **5,919 ships sunk in 60 seconds**. The fix is the split above.

The same "detect by watching state" pattern appears in `combatView` and `audio/director`,
which spot gunfire by comparing `ship.shotCount` against the value they last saw, and
track already-played splashes in a `WeakSet`.

## Conventions

### Angles and coordinates

Screen-space throughout: **+X is east, +Y is down, angles increase clockwise.**

- `heading` is where the bow points. `(cos h, sin h)` is the forward unit vector.
- North is `-PI/2`. `compassFromRad` / `compassName` in `core/math.ts` convert for display.
- Pixi's rotation matches this, so hull art is drawn pointing +X and `sprite.rotation =
  heading` just works.
- `wind.from` is the heading the wind blows **from** (nautical convention); `wind.to` is
  the direction it pushes.
- `awaSigned = angleDiff(heading, wind.from)`, so 0 is head-to-wind and ±PI is running.
  `awa` is its absolute value.

### Units

Distances are arbitrary "units"; a hull is 58 units long and a good turn of speed is
around 200 units/second. The HUD labels speed "kn" as flavour — it is not knots.

### Determinism

`world.reset(seed)` reproduces a run exactly — verified by running a seed three times and
comparing the full result. Avoid `Math.random()` in `sim/`; it exists only in presentation
code (`wake`, `combatView`, `plunderView`) where reproducibility does not matter.

Two rules make that hold, both learned the hard way:

**Independent systems get independent streams.** Gunnery draws from `gunRand`, not the
world PRNG. Sharing one stream meant the *number of shots fired* shifted every later
draw — spawn positions, plunder scatter, the draft — so adding jitter to the volley
timing silently rerolled entire runs and looked like a catastrophic balance regression
(31% → 6%). Deterministic systems that share a stream are not independently testable.

**Everything stateful must actually reset.** The wind's internal clock was never cleared,
so each `reset(seed)` began at a different point in the weather. Every benchmark taken
before this fix carried that noise; comparisons meant to differ only by the change under
test also differed by the wind.

**Everything procedural must actually be seeded.** Terrain and the wind's noise fields
were built once at construction with fixed seeds and never reseeded, so *every run met
the identical archipelago under the identical weather pattern*. Both are now seeded from
the run seed. This was invisible for a long time because the game still looked varied —
it was caught only when disjoint seed blocks returned byte-identical win rates.

## Debug hook

`window.__game` exposes `{ world, camera, loop, input, audio }`. This is how the
simulation gets driven and regression-checked from the console without a human at the
helm. See [TUNING.md](TUNING.md) for the measurement patterns built on it.

## Presentation runs on simulation time

`main.ts` passes the renderer `frameDt × timeScale`, not raw frame time. Running
animations on wall-clock time while the simulation ran on scaled time meant that in turbo
the world moved four times faster than the visuals: wrecks were culled while their hulls
were still visibly sinking, and wake, smoke and plunder all drifted at the wrong rate.

Related invariant: **a view is destroyed when its hull leaves the world by *any* route**,
not only when a sinking animation completes. Keying solely on the animation leaked a view
for every trader that escaped, since those are removed alive.

**A wreck must outlive its own sinking animation.** `WRECK_LINGER`
(3.2s) is deliberately longer than the view's 2.4s plunge, and views are never created for
a ship that has already sunk. Getting this wrong produced a hull that sank forever — the
view finished, destroyed itself, and was immediately rebuilt because the ship was still in
the world. `window.__game.viewCount()` exists to assert the invariant rather than eyeball
it.

## Coupled values to watch

`landRadius()` in `terrain.ts` defines the shoreline, and **both the collision code and
the renderer call it**. Never give either its own idea of where the edge is.

Ordering matters when combining steering constraints: apply the **wind no-go clamp first,
then land avoidance**. Doing it the other way round can throw a heading that was avoiding
a shore straight back into it — a bug the test pilot had and the enemy captains did not.


`cameraZoom` (0.75) and `spawnRadius` (1400) are linked. Enemies must appear beyond the
edge of the view, so the spawn ring has to clear `viewportHalfWidth / zoom`. At 0.75 zoom
a 1400-unit ring covers viewports up to ~2100px wide. **Zoom out further and the spawn
radius must rise with it**, or hulls pop into existence on screen.

The simulation cannot read the viewport without breaking the layering rule, so this is a
constant that has to be kept in sync by hand. Both are sliders in the tuner, and the
`spawnRadius` help text says so.

## Known limitations

- **No object pooling.** Projectiles, wake puffs, smoke and plunder all allocate freely.
  Fine at current entity counts; will want attention if the swarm grows much larger.
- **One `ShipView` per ship**, created and destroyed on spawn and sink. Also fine for now.
- **Sunk hulls are only culled past 24 ships**, so a long run accumulates a few corpses.
- **The audio director is the only `drainSunk` consumer.** If it were removed, the event
  list would grow unbounded — a leak, not a correctness bug, but worth knowing.

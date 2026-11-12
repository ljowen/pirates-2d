# Land

Islands, shoals and the things they make possible. Built following the sequencing in
[plans/scenario.md](plans/scenario.md): obstacles and collision first, so the question
"does terrain make this game better?" got answered before paying for coastlines.

## Locations

A voyage is sailed on a **level**: a fixed map, defined in `src/sim/levels.ts`. The first is
Windward Cays. The endless hashed sea described under *Generation* below is kept as a second
level, Open Sea, and is what every figure further down this page was measured on.

A level is written as a recipe and expanded once, when the module loads, into a plain list of
islands and bars. The recipe is an authoring tool; nothing is generated while you sail.

| Place | Built from | What it is for |
|---|---|---|
| Chain | Islets along a bowed line, shallows mostly run together | Gaps: some anyone may use, some only a shallow hull can thread |
| Atoll | A ring of flat-topped bars with a few cays on it | A lagoon with two deep passes, and one stretch only the shallowest hulls can cross |
| Crescent | Rounds overlapping along a hook | A harbour: shelter from shot, and from the wind |
| Large island | Big rounds along a wandering spine, with headlands | Bays, capes, and a long shore to be caught against |
| Scatter | Lone islets and sandbars in the sea left over | Texture between the places |

Three things changed underneath to allow it:

- **Islands may overlap.** Grounding, shot and the captains' avoidance already took the worst
  of several islands, so joined-up land needed no new physics. The renderer paints all islands
  one layer at a time (all shallows, all surf, all beaches, and so on) so that overlapping
  islands merge instead of one's shallows lying across another's beach.
- **Bars may be flat-topped** (`Reef.flat`). A lone sandbar rises smoothly to its middle; laid
  end to end those leave a soft joint every hull can cross. A plateau makes a wall.
- **A fixed map is indexed once** into 700-unit buckets, each listing what can affect a point
  inside it, so `probe` is one lookup. The endless sea hashes a block of cells per query.

**The map wraps by repeating.** `Level.size` is the side of one tile; `Terrain.local(p)` folds a
point into it, and anything reaching over an edge is listed again on the far side. Positions
in the sim are never folded, so nothing sees a seam: sail off one edge and the same land comes
round again. `terrain.near(p)` answers in the tile's own frame, so pass it `local(p)`; `probe`
does this itself and hands any island back where it was asked. The terrain view draws up to
four repeats of one shared drawing, and the HUD's chart shows the whole tile.

## Generation

The arena is unbounded — you can sail in one direction forever — so terrain cannot be a
stored list. Every grid cell deterministically hashes to "island here or not", giving
infinite reproducible coastline for no memory and no generation step.

```
cell (1500 units) → hash → island? → jittered position, radius, silhouette seed
```

Two details stop it looking like a lattice, both of which were visible bugs first:

**Islands are inset by their own reach, not the global maximum.** The first version inset
every cell by the largest *possible* island, which pinned all of them to the middle 44%
of their cell and made the grid obvious. Insetting by each island's own shoal radius lets
islets roam almost their whole cell while still guaranteeing land never crosses a cell
boundary — verified at zero land-on-land overlaps across 1,024 cells.

**Density varies by region.** A second, coarser hash modulates island frequency across
groups of cells, so the map has archipelagos and open stretches rather than a uniform
sprinkle. Sizes are squared on the way in, so small islets outnumber large islands as a
real chain does — currently 57% under 140 units.

### One edge function, two consumers

`landRadius(island, angle)` gives the irregular shoreline, and **both the physics and the
renderer call it**. A circle for collision and a blob for the eye would be a bug waiting
to happen.

## Reefs and bars

A second feature layer, hashed per cell independently of the islands: **shoal patches
with no dry land in them at all.** Nothing shows above water, nothing blocks shot,
nothing breaks the wind. They do exactly one thing — decide which hulls may pass.

They exist because draught used to pay in only one place: the half ship-length beside a
beach, which is also the one place every hull is in danger anyway. A bar in open water is
draught with nothing else attached.

```
cell → hash → bar? → position, length, width, bearing, least depth
```

**Elongated on purpose.** A circular hazard is a thing to steer round. A bar lying across
your course is a question: go about and lose the ground, or cross it and find out what
you draw. Measured over 1,600 cells at the shipped settings — 55% carry a bar, mean
length 514 units, mean least depth 0.15.

**How pale a bar is, is how shallow it is.** The renderer draws four contours from
`reefField`, the same function the physics reads, and keys their lightness to `least`.
The one thing a player must judge at a glance is whether their own hull can cross, so
that has to be legible from the water rather than discovered by stopping dead in it.

> An earlier version scattered white blobs along the spine as breakers. At the zoom this
> game is played at they read as objects sitting *on* the water rather than as sea
> breaking *over* a shoal, so the shading carries the whole job now.

### Telling the player what is under the keel

Two readouts, because a bar announces itself only by colour:

- **The leadline**, in the point-of-sail panel: a sounding in fathoms over a bar with a
  fixed mark at the depth this hull draws. A bare depth would be a number without a
  question attached — what matters is not how deep the water is but whether *this* hull
  can cross it, and that is a different reading for a Pinnace and a Brigantine. The scale
  is stretched over the bottom third, where everything that matters happens, and the
  colour runs blue → amber → red as the margin above the mark closes. Open sea reads
  *no bottom*.
- **A warning across the screen** — *SHOAL WATER — she will touch*, then *AGROUND* — from
  twice the depth she draws, for when the player is watching the sea rather than the
  instruments.

## Draught

Each hull has a `draught` (0–1). **She is aground when the water is shallower than she
draws** — `draughtDepth × draught`, against a depth where 1 is open sea and 0 is a beach
or a drying bank.

Depth rather than distance-to-a-beach is what lets a bar with no land in it strand a
Galleon while a Pinnace sails over the top. It also gave the island shoals teeth: before
this, every hull could close to within a few lengths of any beach.

| Hull | Draught | Water she needs | Stops off a beach | Bars that stop her | Sea closed to her |
|---|---|---|---|---|---|
| Pinnace | 0.22 | 0.066 | **11** | **32%** | 2.05% |
| Sloop | 0.55 | 0.165 | 29 | 64% | 2.52% |
| Fluyt | 0.80 | 0.240 | 42 | 79% | 2.99% |
| Brigantine | 1.00 | 0.300 | **52** | **89%** | 3.37% |

The spread on the right-hand columns is the point. A Pinnace crosses two bars in three; a
Brigantine crosses one in nine. Where the old distance rule put a 2.3× gap between the
lightest and heaviest hull, depth puts 4.5× — and the bars add a kind of ground that the
heavy hull simply cannot use.

Shallows also drag on a deep keel long before she touches (`shoalDraughtPenalty`), so a
heavy hull is slowed across water she can still technically cross.

### Island shoals vary

`shoalScale` 3.1 with `shoalVariation` 0.9 gives shoal rings from **1.7 to 4.5 × land
radius**, hashed per island. A steep-to rock is a poor refuge; an island standing in a
mile of flats is a fortress a Brigantine cannot come at. Uniform shoals made every island
the same island, which is most of why draught never felt tactical.

Widened from 2.2 after play, then pulled back from 4. Averaged over four hulls, 32 seeds
each:

| `shoalScale` | Rings | Level | Plunder | Aground |
|---|---|---|---|---|
| 2.2 | 1.2–3.2 × | 6.10 | 25.5 | 4.7% |
| **3.1** | **1.7–4.5 ×** | **6.84** | **31.1** | **7.4%** |
| 4.0 | 2.2–5.8 × | 7.34 | 35.1 | 6.7% |

Level and plunder climb steadily with shoal size and 3.1 lands between, which is what it
was picked for. **The grounding column does not behave**: 3.1 measures worse than 4,
driven by the Sloop (9.5% against 7.5%) and the Fluyt (7.9% against 5.3%) while the other
two hulls sit in order. Plausibly medium shoals are the worst of both — wide enough to
catch you, not wide enough to read as somewhere to stay out of — but two hulls out of four
is not enough to claim that, and it may be seed noise. Worth a closer look before anyone
tunes against the aground figure.

Worth keeping an eye on separately: the plunder gain is partly the *enemy* captains losing
ground in water they cannot cross, which is the draught system working, but it shades into
farming if wider shoals simply strand the swarm.

Because the captains' avoidance also keys off the water their own hull needs, heavy hulls
will not follow you into shallows — so the shoals are an **escape valve, not a farming
exploit**. Measured share of a run spent aground, scripted pilot, 32 seeds:

| Hull | Before | After |
|---|---|---|
| Pinnace | 0.97% | 1.5% |
| Sloop | 1.99% | 4.0% |
| Fluyt | 2.51% | 6.0% |
| Brigantine | 6.73% | 8.3% |

Median survival is unchanged within noise (431–442s after, 434–447 before), so this
bought discrimination between hulls rather than difficulty. The bot's figures are a
ceiling on the real cost: it reads a bar through a three-point lookahead, where a player
can see the whole thing.

## Grounding

Contact is measured against the keel depth, not the shoreline: a ship touches before her
centre is over dry land.

> The first implementation tested for `distance < 0` — the hull's centre inland. But the
> collision push holds a ship at ~14 units off the beach, so that condition was
> unreachable and the grounding damage and drag were dead code. Charging an island at
> full sail did nothing at all.

Running aground now costs about 7% of hull over six seconds, scaled by the speed you hit
at, and you can always claw off again under full canvas. A real mistake, not a death
sentence.

## The lee

Islands blanket the wind downwind of themselves — 1.16 to windward against 0.76 in the
lee at default settings. See [SAILING.md](SAILING.md). Sheltering behind an island breaks
off a pursuit but also takes the way off your own ship.

## Cover

**Land blocks shot, and gunners will not fire at a hull behind a headland.** Measured with
two ships 360 units apart in identical geometry:

| | Volleys | Player hull | Enemy hull |
|---|---|---|---|
| Behind an islet | **0** | 1.00 | 1.00 |
| Open water | 12 | 0.34 | 0.18 |

This is what turns an island from an obstacle into a tactic.

## Enemy navigation

Captains steer around shores using **steering behaviour, not pathfinding**: the ship
grazes past an obstacle along its tangent, which rounds a headland naturally and never
produces the stuttering of a replanned path. A navigation mesh over infinite procedural
terrain would cost far more than it returns for enemies that only need to look competent
for the half-minute they are on screen.

A bar is handled differently from a headland, because it has no middle to round: a
captain sheers 60° off the shortest way back to deep water and re-aims next tick. If she
is *already* on the bank she steers straight out — without that case a grounded hull
sheers along the bar she is sitting on, with her sails still driving her into it, and
stays there. Adding it cut the Brigantine's time aground from 17% of a run to 10%.

**A deep hull looks further ahead** — `aiLandLookahead × (0.8 + 0.7 × draught)`. One
lookahead for every hull meant the heaviest ones saw a bar at exactly the range they
could no longer avoid it; scaling it took the Brigantine from 10.7% aground to 8.3%.

## No lagoon starts

Broad shoals and bars across open water can between them enclose a pool of deep water
that a given hull cannot get out of. That is fine as a hiding place you chose and
unacceptable as the place the run begins — the one position the player never picked.

So deep water is no longer enough on its own. `Terrain.escapes` casts sixteen courses out
to 1,500 units and counts how many run clear for the hull being sailed; the spiral keeps
walking until it finds a position with at least four, and otherwise takes the best it
saw. Verified across **400 seeds × 4 hulls: no lagoons, worst case 9 of 16 courses
clear.**

## Other integrations

- **Spawning** rejects positions on land, and now also any water too shallow for the hull
  being spawned, up to twelve tries.
- **Plunder** that washes ashore is nudged back into navigable water — losing a prize to
  a beach would be a loss through no fault of the player.

## Effect on balance

Measured with the versioned harness in [TUNING.md](TUNING.md), 16 seeds:

| | Win rate | Median | Avg level |
|---|---|---|---|
| Open ocean | 50% | 480s | 12.4 |
| With land | **38%** | 442s | 10.7 |

A moderate difficulty increase, part of which is cover legitimately slowing kills. Set
`islandDensity` to 0 in the tuner to restore open ocean.

> Terrain initially appeared to halve the win rate, to 13%. That was the measurement bot
> grounding itself 18% of the time, because land avoidance had been given to the enemy
> captains and not to the test pilot. The harness was measuring its own incompetence —
> see the pitfalls section of [TUNING.md](TUNING.md).

## Still to come

See [plans/scenario.md](plans/scenario.md). The obvious next steps are reefs as standalone
hazards away from islands, weather, and eventually authored coastlines — which need the
one-continuous-space question settled first.

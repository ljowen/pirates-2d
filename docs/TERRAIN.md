# Land

Islands, shoals and the things they make possible. Built following the sequencing in
[plans/scenario.md](plans/scenario.md): obstacles and collision first, so the question
"does terrain make this game better?" got answered before paying for coastlines.

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

## Draught

Each hull has a `draught` (0–1) that decides how far out she touches bottom and how badly
shallows slow her. This is what makes land a *weapon* rather than scenery.

| Hull | Draught | Stops from shore | Speed crossing a shoal |
|---|---|---|---|
| Pinnace | 0.3 | 17 | **102** |
| Sloop (player) | 0.55 | 24 | 72 |
| Barque | 0.75 | 29 | 45 |
| Brigantine | 1.0 | 35 | **5** |

A Brigantine is effectively anchored in water a Pinnace crosses at full speed. Because
the captains' avoidance margin also scales with draught, heavy hulls will not follow you
into shallows — so the shoals are an **escape valve, not a farming exploit**.

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

Measured at **0.00% of AI time aground** across 600 simulated seconds and three seeds.

## Other integrations

- **Spawning** rejects positions on land, up to twelve tries.
- **The player's start** spirals outward until it finds open water, so no terrain seed
  can begin a run on a beach.
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

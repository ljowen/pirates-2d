# Pirates2D

A faithful homage to *Sid Meier's Pirates!*, reimagined as a Vampire Survivors-style
survival game.

> **You steer. The cannons fire themselves. The wind is your dodge mechanic.**

Vampire Survivors is "you only move, the weapons fire themselves." Pirates! sailing is
"where you can go is constrained by the wind." Those two compose: positioning becomes
simultaneously a question of wind (can I even get there?) and of the swarm (do I want to
be there?). Getting caught in irons with a frigate bearing down is the moment the whole
design hangs on — which is why the sailing model was built first and everything else
hangs off it.

## Running it

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # typecheck + production build
```

TypeScript, PixiJS v8 for rendering, Vite. No other runtime dependencies — the water,
hulls, rigging and every sound are generated procedurally at runtime.

## Controls

Taken from the *Pirates! Gold* manual.

| Input | Action |
|---|---|
| ← / → (or LMB / RMB) | Turn |
| ↑ / ↓ | Raise / lower sails |
| 1 / 2 / 3 | Pick a card during a level-up draft |
| P | Pause |
| T | Turbo (4× time) |
| M | Mute |
| C | Sail on into endless mode (offered when you complete a voyage) |
| R | Reset the run |
| E | Spawn an enemy (cycles Pinnace → Barque → Brigantine) |
| F1 | Debug overlay — polar plot, velocity vectors, numbers |
| ` | Live tuning panel (or click **⚙ Tune**, bottom right) |

A control legend sits along the bottom of the screen, so none of this has to be
memorised from here.

## What's built

| Phase | Status |
|---|---|
| 0 — Harness: fixed-timestep loop, camera, live tuning panel | **Done** |
| 1 — Sailing: wind, polar curve, momentum, leeway, tacking, sail states | **Done** |
| 2 — Combat: broadsides, shot with travel time, damage model, enemy captains | **Done** |
| 3 — The swarm: spawn director, plunder, level-up draft, bosses, win/loss | **Done** |
| — Endless mode: sail on past the voyage for a score | **Done** |
| — Land: islands, shoals, draught, grounding, cover | **Done** |
| 4+ — Scenario, art direction, meta progression | Planned — see [docs/ROADMAP.md](docs/ROADMAP.md) |

## Documentation

**Reference — how the thing works today**

| Doc | Covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code layout, layering rules, conventions, key seams |
| [docs/SAILING.md](docs/SAILING.md) | The polar curve, leeway, tacking, sail states |
| [docs/COMBAT.md](docs/COMBAT.md) | Gunnery, damage, ship classes, enemy captains |
| [docs/PROGRESSION.md](docs/PROGRESSION.md) | Run structure, spawn director, plunder, the draft |
| [docs/TERRAIN.md](docs/TERRAIN.md) | Islands, shoals, draught, grounding and cover |
| [docs/AUDIO.md](docs/AUDIO.md) | Procedural sound and the simulation-driven beds |
| [docs/TUNING.md](docs/TUNING.md) | The tuning panel and the headless measurement harness |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are the way they are, and departures from Pirates! |

**Forward — what's next and how to get there**

| Plan | Covers |
|---|---|
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase overview and recommended ordering |
| [docs/plans/balance.md](docs/plans/balance.md) | The open balance problem — **start here** |
| [docs/plans/scenario.md](docs/plans/scenario.md) | Weather, landmasses, reefs, lee shores |
| [docs/plans/combat-refinement.md](docs/plans/combat-refinement.md) | Shot types, gunnery trade-offs, boarding |
| [docs/plans/progression-meta.md](docs/plans/progression-meta.md) | Player hulls, ports, persistent captain |
| [docs/plans/art-direction.md](docs/plans/art-direction.md) | Visual style, inspirations, HUD language |

## Repository layout

```
src/
  core/     loop (fixed timestep), input, math, noise, rng
  sim/      world, ship, wind, polar, combat, ai, shipClasses, terrain,
            director, run, upgrades, plunder, tuning
  render/   camera, water, terrainView, shipView, wake, combatView,
            plunderView, hud, debug
  audio/    audio (procedural synthesis), director
  ui/       tuner, draft
  dev/      testPilot — the scripted captain used for balance measurement
docs/       reference documentation and forward plans
```

The one rule that matters: **`sim/` knows nothing about rendering, audio or UI.** See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

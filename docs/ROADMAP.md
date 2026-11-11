# Roadmap

## Where things stand

| Phase | Status |
|---|---|
| 0 — Harness: fixed-timestep loop, camera, live tuning panel | **Done** |
| 1 — Sailing: wind, polar curve, momentum, leeway, tacking, sail states | **Done** |
| 2 — Combat: broadsides, shot travel, damage model, enemy captains | **Done** |
| 3 — The swarm: director, plunder, draft, bosses, win/loss | **Done**, curve confirmed winnable |
| — Sound | **Done** |
| — Endless mode | **Done** |
| — Land: islands, shoals, draught, grounding, cover | **Done** |
| — Weather: squalls | **Done** |
| — Career: port, refits, feats, notoriety, the hunter | **Done**, measured, unplayed |

The game is playable end to end. The systems are in place and measured. What it does not
yet have is a finished difficulty curve or any visual identity beyond programmer art. It
now has something to come back for after a run ends — see
[plans/goal-roguelite.md](plans/goal-roguelite.md) — though that layer has been measured
by the harness and not yet played by a person.

## Recommended ordering

### 1. Balance — [plans/balance.md](plans/balance.md)

**Largely resolved.** Runs are now winnable by a human, and the scripted pilot reaches
85%+ of the run in 9 cases out of 10. The curve works.

What remains is refinement — most obviously whether the final boss wave is the right
difficulty, since that is where nearly every losing run now ends. Treat the current tuning
as the baseline to preserve when adding content, and re-measure against it.

### 2. Combat refinement — [plans/combat-refinement.md](plans/combat-refinement.md)

The draft currently has fourteen cards and runs out of interesting choices. Deepening
gunnery — real range/damage/accuracy trade-offs, carronades vs long guns, raking fire,
more shot behaviour — adds draft content cheaply because the systems already exist.

Best done after balance, so new cards are tuned against a curve that works.

### 3. Art direction — [plans/art-direction.md](plans/art-direction.md)

Write the direction document early; do the art later. Knowing the intended silhouette
language, palette and HUD vocabulary costs little and stops later work pulling in
different directions. The actual art should wait until the entity roster stops changing.

### 4. Scenario — [plans/scenario.md](plans/scenario.md)

**Landmasses, reefs and squalls are done** — see [TERRAIN.md](TERRAIN.md) and
[SAILING.md](SAILING.md#squalls). What remains is calms (now nearly free: a calm is a
weather cell with a negative gain, and the cell machinery exists), night and weather
states, sea state, and eventually authored coastlines.

### 5. Meta progression — [plans/goal-roguelite.md](plans/goal-roguelite.md)

**Built:** a career of hulls, permanent refits, earned cards, feats and a notoriety ladder,
with a Man-o'-War to run from at the start and to hunt at the end. What remains is listed
at the foot of the goal document, and the first item is the one that matters: play it.
The older, wider plan — ports as places, a crew roster, voyages with objectives — is still
in [plans/progression-meta.md](plans/progression-meta.md).

## The decision that keeps resurfacing

**One continuous space, or an overworld plus a battle screen?**

Pirates! separates them. Vampire Survivors is one arena. The current lean is one
continuous space, because modal transitions would kill swarm pressure.

It has not blocked anything so far, but both the scenario and meta-progression plans press
on it — landmasses imply a map, and a voyage structure implies somewhere to voyage *to*.
It should be settled before either of those starts in earnest.

## Things deliberately not planned

- **Multiplayer.** Nothing in the architecture precludes it; nothing in it anticipates it
  either.
- **Mobile or touch controls.** The two-button helm would port reasonably, but it is not a
  consideration yet.
- **Procedural audio beyond the current set.** Music, in particular, is a real project of
  its own and probably wants actual composition rather than synthesis.

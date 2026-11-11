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

The game is playable end to end. The systems are in place and measured. What it does not
yet have is a finished difficulty curve, any visual identity beyond programmer art, or
anything to come back for after a run ends.

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

### 5. Meta progression — [plans/progression-meta.md](plans/progression-meta.md)

Player hull selection, ports, persistent captain, voyage structure. This is what makes
people come back after a run ends, but it should wait until a single run is genuinely
good — a retention layer on an unsatisfying loop just extends the disappointment.

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

# Plan: meta progression

What makes someone start a second run. **This should wait until a single run is genuinely
good** — a retention layer on an unsatisfying loop just extends the disappointment.

Current state: run-scoped only. Every run starts from a stock Sloop, nothing persists.
That was chosen deliberately so the difficulty curve has exactly one variable, and it
should stay that way until [balance](balance.md) is settled.

## 1. Player hull selection — **done**

See [../PROGRESSION.md](../PROGRESSION.md). Four hulls, separate roster from the enemy
classes, 13–19% win spread across 32 seeds each.

## 1a. Original plan, kept for the reasoning

The `ShipClass` system already exists and already carries everything needed. Letting the
player choose their hull at the start of a run is close to free and immediately multiplies
replay value.

| Hull | Character |
|---|---|
| **Pinnace** | Very fast turner, tiny broadside, fragile. A dodging build. |
| **Sloop** | The current baseline. |
| **Brigantine** | Heavy broadside, sluggish. Stand and fight. |
| **Fluyt** | Roomy, poor gunnery, far more plunder gathered. A greed build. |

Each one makes the same sea play differently, and each biases the draft — a Pinnace wants
turn-rate and accuracy, a Brigantine wants reload and hull.

**Work required:** a start screen, and tuning each hull so none dominates. The `ShipClass`
seam means no physics changes at all.

**Caveat:** the Brigantine's stats are currently tuned as an *enemy boss*. A player
version would need separate tuning — do not simply reuse it.

## 2. Unlocks

Classic roguelite shape: bank plunder across runs, spend it on permanent unlocks.

Two distinct flavours, worth keeping separate:

**Content unlocks** — new hulls, new upgrade cards entering the draft pool. These add
variety without inflating power, so they do not disturb the difficulty curve. **Prefer
these.**

**Power unlocks** — permanent stat bonuses. Stronger retention hook, but they make the
curve a moving target and every balance measurement conditional on progression state.
**Be cautious**; if added, keep them small and bounded.

The `ShipMods` seam supports either. Content unlocks need only a filter on the draft pool.

## 3. Captain and crew

The most *Pirates!* direction, and the one with the most fantasy in it.

- **A named captain** who persists across voyages, accumulating reputation.
- **Crew as a roster** rather than a single number — a master gunner who improves reload,
  a sailing master who improves handling, a carpenter who repairs. Recruited in port,
  lost in action.
- **Reputation** affecting what hunts you. Sink enough Spanish shipping and the Spanish
  send a squadron.

That last idea is strong: it ties the spawn director to player behaviour, so the swarm
becomes a consequence rather than a schedule. It would also give the existing
`BOSS_WAVES` structure a diegetic reason to exist.

## 4. Ports

Somewhere to go between actions. Repair, recruit, refit, sell plunder, take on a mission.

**The problem:** ports imply a map, and a map implies the structural question the project
keeps deferring — one continuous space, or an overworld plus battle screens? See
[scenario.md](scenario.md) and [../ROADMAP.md](../ROADMAP.md).

**A lighter version that avoids the question:** a port is a *location within the single
arena* — sail to it, and while you are in its shelter you repair and can spend plunder,
but the swarm is still out there waiting. That keeps the single-space pressure and still
gives the player somewhere to aim for. It also interacts with the wind beautifully: a port
to windward is a hard-won refuge.

I would try that before building an overworld.

## 5. Voyage structure

The full *Pirates!* career: runs become voyages with objectives — raid a port, intercept a
treasure fleet, escape a hunting squadron — within a persistent career.

This is the most faithful and the most ambitious, and it presumes everything above. It is
a Phase 6+ idea, recorded here so the earlier decisions do not foreclose it.

Notably, **the timed-survival run is compatible with it**: a voyage could simply be a
sequence of timed engagements with different conditions and objectives. Nothing currently
built would need to be thrown away.

## Sequencing

1. **Player hull selection** — near-free, big return, do it as soon as balance settles
2. **Content unlocks** — variety without curve disturbance
3. **Ports as in-arena locations** — tests the idea without committing to a map
4. **Crew roster** — depends on ports existing
5. **Reputation-driven spawning** — the best idea here, but needs the above
6. **Voyage structure** — only after the structural question is answered

## What not to do yet

Do not add persistent power bonuses before the single-run curve is finished. Every
balance measurement in these docs assumes a stock Sloop; making the starting state
variable invalidates all of them at once.

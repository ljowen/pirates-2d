# Ship-to-ship combat

**The guns fire themselves.** There is no fire button — a battery that is loaded and has
a target inside its arc speaks on its own. Your job is to put the enemy on your beam and
keep them there, which is the same positioning problem the sailing model already poses,
now with teeth.

This is the Vampire Survivors half of the fusion, and a deliberate departure from
*Pirates!*, which has a fire key. See [DECISIONS.md](DECISIONS.md).

## Broadsides

Port and starboard batteries, each with its own reload timer, firing in a ±62° arc square
out from the beam. A battery only fires if a target is genuinely inside its arc — it then
aims properly, leading the target by its velocity.

- **Shot has travel time.** 280 units/s against a 500-unit range, so up to about 1.8
  seconds of flight. Deliberately slow: seeing a volley coming and sailing out from under
  it is a skill the game should reward, and it is the clearest expression of the wind
  being your dodge mechanic.
- **Gunners converge on an intercept.** The firing solution iterates twice rather than
  once. With shot this slow a single pass badly under-leads, because the first estimate
  uses the flight time to where the target *is* rather than where it will be — and gunners
  that cannot hit a moving ship starve the whole progression loop.
- **Accuracy falls off with range**, so closing is rewarded.
- **A volley spreads evenly across the arc** rather than randomly, so a broadside reads
  as a wall of shot instead of a shotgun blast.
- **Guns fire as a short ripple** (visually and audibly), not one blast — historically
  accurate and far more legible.

The HUD draws the arcs on the water as two wedges either side of the hull, brightening
when a loaded battery actually bears. That teaches the mechanic without a word of
tutorial: you can see that the ship has to come abeam.

## Damage

Three tracks, and the middle one is the important one:

| Track | Effect |
|---|---|
| **Hull** | Reaches zero and she sinks |
| **Rigging** | Scales drive down toward `sailDriveFloor` (25%) |
| **Crew** | Slows reloading and sail handling |

A ball's damage splits roughly 62% hull / 24% rigging / 14% crew, modified by shot type.

**Rigging damage is what wires gunnery back into the sailing model.** Lose your sails and
you lose the ability to *choose where you are*, which is the only defence this game has.
So shooting out an enemy's rigging stops them fleeing, and losing your own is how a fight
starts going badly. A crippled ship also *looks* crippled — canvas shrinks on the yards
before you read any bar.

### Shot types

Upgrade cards bias where shot lands, then the split is **renormalised**. This is what
keeps shot types a choice rather than a damage bonus: loading chain buys rigging damage
by giving up hull damage.

| Card | Effect |
|---|---|
| **Chain Shot** | ×2.1 rigging, ×0.82 hull — tears rigging and strands them |
| **Grape Shot** | ×2.4 crew, ×0.85 hull — guts gunnery and helm |
| **Double-Shotted** | ×1.7 hull, ×0.8 rigging and crew — fastest way to sink |

## Ship classes

A hull is a `ShipClass`; upgrades are `ShipMods` layered on top. Effective stat =
**tuning baseline × class × mods**. Hull types come from the *Pirates!* ship list rather
than being invented.

| Hull | Tier | Guns | Toughness | Handling | Role |
|---|---|---|---|---|---|
| **Pinnace** | 1 | 2 | 0.26 | turns 45% faster, short-ranged | Swarm fodder |
| **Barque** | 2 | 4 | 0.58 | slightly handier than baseline | Standard threat |
| **Brigantine** | 3 | 6 | 1.00 | baseline | Boss |
| *Sloop (player)* | — | 6 | 1.00 | baseline | — |

The player's Sloop is deliberately identical to the tuning baseline in every respect. The
Brigantine fight was balanced and signed off against exactly those numbers, so giving the
player even a small handling edge would quietly make the intended boss easier. Player
hull variety belongs in [plans/progression-meta.md](plans/progression-meta.md).

### Measured engagements

Current tuning, no self-repair, scripted pilot holding the enemy abeam and never
pinching. Three runs each.

| Engagement | Won | Duration | Player hull remaining |
|---|---|---|---|
| 1× Pinnace | 3/3 | 19–29s | 1.00 (never lands a shot) |
| 3× Pinnace | 3/3 | 19–28s | 0.89–1.00 |
| 5× Pinnace | 3/3 | 17–26s | 0.56–0.73 |
| 1× Barque | 3/3 | 38–41s | 0.85 |
| 2× Barque | 3/3 | 38–48s | 0.45–0.54 |
| **1× Brigantine** | **2/3** | 50–81s | **0.00–0.18** |

The Pinnace has the right swarm profile: harmless alone, costly in numbers, never unfair.
The Brigantine remains a knife-edge fight against a stock ship, which is exactly why it is
the boss.

> These numbers were measured at `ballSpeed` 430 and have not been re-measured since it
> dropped to 280. Expect longer engagements: slower shot means more misses on both sides.
> They moved substantially once before, between Phase 2 and Phase 3 (range 420→500, arc
> 50°→62°, reload 2.4s→2.0s, Pinnace and Barque toughness both down), when a Pinnace took
> 31–38s to kill and two Barques were lethal. **If you retune gunnery, re-measure this
> table** — see [TUNING.md](TUNING.md) for the harness.

## Enemy captains

Enemy ships run the **same `Ship` physics and obey the same wind**. This is the point: an
AI that could sail straight upwind would turn the wind into a handicap the player alone
pays. Because these captains have to tack too, the wind reads as a law of the world, and
running to windward becomes a real escape.

Behaviour (`sim/ai.ts`):

1. **Close** if further than `aiStandoff × 1.3`.
2. **Hold you abeam** at standoff, to keep a broadside bearing. A settled duel therefore
   becomes two ships turning circles around one another.
3. **Sheer off** inside `aiMinRange`, so they do not foul you.
4. **Beat and tack** when the course they want lies too close to the wind, laying off at
   `aiBeatAngle` with hysteresis so the helm does not chatter.
5. **Shorten sail** for the knife fight, crack on when there is ground to make.

### The pinching bug

Worth recording, because it was the single biggest behavioural fault in Phase 2.

The AI originally laid off at 42° — the *edge* of the no-go zone. That is precisely the
pinching mistake the sailing model punishes the player for. It sailed at a **mean of 36°
off the wind at roughly a quarter speed** and could never close with anyone. Only 19% of
a duel was spent within gun range.

Laying off at best VMG (60°) instead took its mean heading to **71–84° off the wind**.
The lesson generalises: the wind model is a real system with real traps, and anything
sailing in it can fall into them.

## Collision

Hulls are solid. A soft separation push keeps ships from drifting through one another at
close quarters — without it a knife fight stops reading as one. There is no collision
damage or momentum transfer.

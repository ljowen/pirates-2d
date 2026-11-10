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
- **Three separate things decide where a ball goes**, and they are deliberately kept
  apart because they say different things:

  | | What it is | Scales with |
  |---|---|---|
  | `ballSpread` | The *deliberate* fan — the wall of shot the volley is spread across | Range |
  | `gunLayError` | How badly each gun is actually laid, by a man on a moving deck | Range, crew, `mods.spread` |
  | `gunLeadError` | How wrong the gun captain is about the target's **speed** | Crew, `mods.spread` |

  The last is the one that rewards closing. At point-blank a bad guess at the target's
  speed costs nothing; at long range against a ship crossing your bows it throws the shot
  a whole hull wide. All three answer to `mods.spread`, so Trained Gunners buys down every
  source of error rather than only the fan.

### How accurate is accurate enough?

Gunnery used to be close to deterministic at fighting range. **At a 230-unit standoff the
whole fan landed inside the target's hit radius**, so every gun that bore was effectively
a hit — which is why adding modest per-gun error changed nothing at first: 53.1% of balls
hit before, 53.1% after. The error has to be comparable to the hit radius to mean
anything at all.

Measured over 48 seeds, counting every ball the player fired against every ball that
struck a hull:

| | Hit rate | Hits taken | Median | Kills | Level |
|---|---|---|---|---|---|
| Before | 53.9% | 122.3 | 444s | 35.1 | 11.2 |
| **Now** | **47.3%** | 121.5 | 442s | 33.5 | 11.2 |

A 12% relative drop in accuracy, applied to both sides, that leaves survival and the
power curve untouched. Most of it came from widening the deliberate fan (0.055 → 0.08)
rather than from per-gun error, deliberately: the fan is what makes a broadside straddle
its target and still read as a wall of shot, where leaning on random lay error instead
turns it back into the shotgun blast the even spread was introduced to avoid.
- **The broadside goes off together**, but not to the instant. Every gun captain is
  waiting on the same order, so the volley lands as a single crash — which is also what
  makes it something you can see coming and sail out from under as a whole. Each gun
  takes its own small, *independent* scatter within `gunVolleyScatter`, so the guns speak
  a few hundredths of a second apart and the smoke blooms raggedly along the hull.
- **The scatter does not accumulate.** Because each gun draws its own delay rather than
  queueing behind the one before it, a twelve-gun battery is no slower to fire than a
  six-gun one. A sixty-millisecond window is a crash with texture; a quarter of a second
  was a roll down the ship's side.
- **Each gun is re-laid at the moment it speaks**, not when the order was given — the way
  a broadside was actually worked, each gun captain firing as his gun bore. It matters
  much less now the window is this short, but it costs nothing and stays correct if the
  scatter is ever opened up again.

The HUD draws the arcs on the water as two wedges either side of the hull, brightening
when a loaded battery actually bears. That teaches the mechanic without a word of
tutorial: you can see that the ship has to come abeam.

### Crew steadiness

How tightly the volley lands depends on the crew. A well-drilled one touches off almost
as a single gun; a shot-up one is loose and ragged about it — so crew damage has an
audible tell inside the volley, not just in the reload timer. The scatter window is
`gunVolleyScatter` divided by crew steadiness.

Measured span from first gun to last, over 400 volleys, against a 0.06s base window:

| Crew | 6 guns, mean span | Widest seen |
|---|---|---|
| Fresh (1.0) | 0.043s | 0.060s |
| Half (0.5) | 0.061s | 0.085s |
| Mauled (0.15) | **0.088s** | 0.122s |

A mauled crew is twice as ragged, and still fires what reads as one broadside.

### Together rather than in sequence

The guns used to fire in a true ripple, each waiting on the one before it. Measured spans:

| | Ripple | Together |
|---|---|---|
| 6 guns, fresh crew | 0.186s | **0.043s** |
| 12 guns, fresh crew | 0.247s | **0.051s** |

The second row is the point. Under a ripple the volley got longer as the battery grew, so
the reward for drafting gunports was a broadside that took a quarter of a second to leave
the ship and could be half-dodged. Independent scatter makes the volley one event whose
length does not depend on how many guns are in it.

### Why per-gun aiming matters

*Measured while the guns still fired as a long ripple.* Spreading a volley over time
costs accuracy, and how much depends entirely on when the gun is aimed:

| Aiming model | Win rate | Avg level |
|---|---|---|
| No ripple (all guns at once) | 38% | 10.7 |
| Ripple, one solution for the volley | 19% | 9.6 |
| Ripple, bearings fixed to the hull | 13% | 8.9 |
| **Ripple, each gun re-laid as it fires** | **31%** | **11.7** |

A single solution computed for the whole volley goes stale while the target sails on, and
twelve guns firing on it miss badly. Fixing bearings to the hull is worse still, because
a ship holding a target abeam is turning constantly, so the guns sweep past her.

The remaining 38% → 31% was the honest cost of spreading a volley over time. Most of that
cost is gone now the window is 0.043s rather than 0.186s — but the per-gun aiming stayed,
because it is strictly more correct and costs nothing.

## Three pools, three ways to take a ship

Hull, rigging and crew are not one health bar wearing three hats. Each is a different
way to beat a ship, which is taken from the source rather than invented — the *Pirates!*
manual has a dismasted ship losing control and surrendering at your next approach, and
advises cutting a crew down with grape before boarding her.

| Pool | At zero | How you win with it |
|---|---|---|
| **Hull** | She sinks | Fastest, and the cheapest in attention |
| **Rigging** | No control: she cannot run, chase or hold you abeam | She strikes when you come alongside |
| **Crew** | Not hands enough to resist a boarding | She strikes when you come alongside |

### What rigging damage is worth

Measured on a Brigantine, settled on a steady heading:

| Rigging | Top speed | | Turn rate | |
|---|---|---|---|---|
| Sound | 218 | 100% | 32.7°/s | 100% |
| 50% | 164 | 75% | 24.5°/s | 75% |
| 22% *(she strikes)* | 124 | 57% | 19.9°/s | 61% |
| Shot away | 81 | 37% | 16.3°/s | 50% |

Speed comes from `sailDriveFloor`; the helm from `sailTurnFloor`, which was added late.
Before it, **rigging damage cost a ship speed but not a degree of turn** — a hull with her
canvas in ribbons came round as smartly as a sound one, because steerage saturates well
below her crippled speed. That made "tears rigging and strands them" a half-truth.

> **The strong version measured worse, and the reason is worth keeping.** At a 0.25 floor
> — a dismasted ship turning at a quarter — the chain build *fell* from 12.2 to 8.5
> average levels. Isolating the two halves showed most of the loss came from crippling
> the *enemies*: a ship that cannot turn cannot come to you, so she wallows at range,
> drifts out of your arc, and has to be chased down to be boarded. Crippling the player's
> own helm cost the rest. At a 0.5 floor the effect is real through the whole useful range
> and the chain build measures 11.1 levels against 10.2 for no shot card — within noise of
> having no helm effect at all, but now the card tells the truth.

### Reading a fight

The three pools are what the player is now shooting *for*, so all three are drawn over
every visible enemy — hull, rigging, crew, in the same order and colours as the captain's
own condition panel. A single hull bar hid two thirds of the decision.

**A beaten ship flies a white flag**, from the moment she can be taken rather than after
she has been. There was a caption over her for a while — *close to take her* — and a
caption is a worse version of the same idea: it says in words what the ship can say about
herself, it sits in the instrument layer rather than on the water, and it reads as UI in
a scene that is otherwise entirely diegetic. A flag that appeared only after the capture
would be a receipt; what the player needs is a ship saying *come and take me* while there
is still a decision about whether to go. It goes when she does.

**Pickups say what they were.** A number pops where a piece comes aboard — gold for
plunder, green for hull mended. The magnet sweeps flotsam in from nearly two hundred
units, often from behind the ship, so without this the only feedback for collecting is a
bar somewhere else moving slightly. Pieces arriving within a third of a second of each
other merge into one number, because a wreck's worth arrives as five pieces over several
frames and five separate *+1.2*s climbing over each other is noise where one *+6* is
information.

**A prize lies dead in the water.** Her canvas comes down, nobody is at the helm, and
her way comes off over about two seconds (`prizeStop`) with the wind no longer pushing
her about. Her own drag would stop her eventually, but eventually is far longer than a
prize is on the water for — from a good turn of speed she would still be making 68 after
six seconds — and a hull still moving under bare poles reads as one trying to get away,
which is the exact opposite of what a prize should look like.

| Seconds after striking | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Still sailing | 146 | 122 | 104 | 89 |
| **Struck** | **47** | **14** | **4** | **1** |

A beaten ship strikes only when the player comes within `boardingRange`. That is
deliberate: a dismasted ship does not surrender to an enemy half a mile off, and
requiring the approach keeps chain and grape honest — they *set up* the capture, they do
not perform it. It also makes the last act of a fight a decision to close rather than a
damage threshold quietly passing.

**A prize is worth more than a wreck**, which is the manual's own economy: sinking a ship
sends her cargo to the bottom, and every ball you put into her lowers what she is worth.
So `prizeValue` is 1.65× her base against `sinkShare` 0.75× for a wreck, and the prize is
scaled by how intact her hull is — capture her at full hull and she is worth 2.4× a
wreck; batter her to a third and she is barely worth more.

### Why this was needed

Measured before the change, forcing each doctrine over 32 seeds:

| Build | Median | Kills | Level |
|---|---|---|---|
| Double-Shotted | 480s | 38.4 | 12.6 |
| *No shot card at all* | 446s | 34.0 | 11.5 |
| Grape Shot | 431s | 23.4 | 8.5 |
| Chain Shot | 317s | 21.1 | 8.1 |

Chain and grape were not merely weak, they were **worse than taking nothing** — trap
cards. A ship died by hull only, so diverting damage into pools that could not kill cost
40% of the kills, and kills are plunder and plunder is levels.

After, at the shipped settings:

| Build | Median | Sunk | Taken | Level |
|---|---|---|---|---|
| No shot card | 442s | 34.4 | 0 | 10.25 |
| Double-Shotted | 441s | 34.6 | 0 | 10.09 |
| Chain Shot | 421s | 20.2 | **7.7** | **11.03** |
| Grape Shot | 448s | 25.2 | **5.7** | **11.38** |

Chain and grape now buy about a level of progression for a small cost in survival, which
is what a doctrine should be. **Double-Shotted remains level-for-level with taking no
shot card at all** even after its hull bias was raised from ×1.7 to ×2.1 — more damage
per ball does not convert into more kills, because the limiting factor is how many hulls
are in the arc, not how fast each one dies. It wants a different idea rather than a bigger
number.

### Chain or grape?

They both end in a capture, which made "why would I take chain?" a fair question with an
embarrassing answer for a while: you would not. Measured over a full run, grape was ahead
on plunder, levels, median survival *and* hits taken. Two routes to an identical outcome,
one of them strictly better.

The difference is real, but it lives somewhere the ordinary benchmark could not see.
**Chain is how you catch anything that runs.** A stern chase after a Fluyt — she is worth
26 base, the richest hull afloat, and she runs the moment she sees you — over 40 seeds,
starting 500 units astern:

| Loaded with | Caught | Taken whole | Sunk | Escaped |
|---|---|---|---|---|
| Round shot | 12/40 | 0 | 12 | 28 |
| **Chain shot** | **25/40** | **24** | 1 | 15 |
| Grape shot | 10/40 | 10 | 0 | 30 |

Chain more than doubles the odds of running a trader down, and takes her whole instead of
sinking her — which is the difference between about 40 plunder and about 20. Grape is no
better at it than round shot, because a thinned crew does not slow a ship much and nothing
about it stops her sailing away.

So the two doctrines answer different questions:

- **Chain** — *nothing gets away.* Richest when the sea is full of prizes worth chasing.
- **Grape** — *nothing hurts you.* Measured 11% fewer hits taken over a run, because a
  gutted crew works her guns slowly.

> **The harness hid this for a long time, and the reason is a recurring one.** The
> scripted pilot engaged whatever was nearest and never pursued a trader, so two Fluyts a
> run sailed off untouched under every build and chain's whole purpose went unmeasured.
> Teaching it to chase a runner from up to 1,300 units — she spawns at 1,400 and is
> already leaving, so a shorter trigger never fires — moved chain from 10.2 average levels
> to 10.8 and ahead of grape, without changing a single balance number. This is the third
> time a missing pilot skill has shown up as a weak mechanic; see
> [TUNING.md](TUNING.md).

Final standing, 32 seeds, pilot drafting normally except for the forced doctrine:

| | Median | Level | Plunder | Prizes | Hits taken |
|---|---|---|---|---|---|
| No shot card | 447s | 8.53 | 45.0 | 0 | 121.9 |
| **Chain** | 442s | **10.81** | **75.2** | **7.2** | 133.0 |
| **Grape** | 444s | 10.16 | 69.8 | 4.8 | **118.4** |

### What was tried and reverted

**Scaling a prize by her crew as well as her hull.** A ship has to be sailed home, and one
whose people have been swept off her deck has nobody left to work her — good fiction, and
it would have separated the doctrines. It is a flat tax rather than a trade: a grape
capture is *by definition* a low-crew capture, so every single one took the penalty. Even
at a modest weight it cost that build two levels and a hundred seconds of run and pushed
its plunder below taking no shot card at all. Whatever separates two doctrines cannot be
something only one of them can ever avoid.

## Enemy doctrines

The player's rigging and crew bars used to be **mathematically incapable of moving**.
Measured over 32 runs: incoming rigging damage 0.18/minute against 1.56/minute of repair,
and crew 0.10 against 0.96 — repair outran damage by nine times, and across all those
runs the player never dropped below 69% rigging or 79% crew for a single frame. Two
thirds of the damage model were decorative.

Two changes fixed it, and the second matters more than the first:

1. **Rigging and crew mend about twice as fast as they are shot away**, not nine times —
   `playerSailRepair` 0.026 → 0.0085, `playerCrewRepair` 0.016 → 0.005. `sailDriveFloor`
   also fell from 0.25 to 0.15, so losing canvas costs real speed.
2. **Some hulls load something other than round shot.** A `shotBias` on the class, read
   through the same `shotSplit` the player's cards edit:

   | Hull | Loads | Why |
   |---|---|---|
   | Royal Sloop | Grape | She gets inside your reach; thinning your crew slows your reload, which is how an irritant that cannot sink you still beats you |
   | Frigate | Chain | She fights at arm's length, so she cuts your canvas to keep you there |

   With every hull afloat firing round shot, no ship in the game could threaten your
   canvas. Now the worst moment of a run reads **0.42 rigging** where it used to read
   0.84, and the Frigate encounter is a different fight from the Barque one.

### Hull size is evasion

Hit radius scales with the hull's own size, so a Pinnace is genuinely hard to hit and a
Galleon can hardly be missed. A single radius for every ship made size purely cosmetic:
small hulls took all the drawbacks of being small with none of the evasiveness, which
left the Pinnace strictly worse than everything rather than differently good. Adding it
moved the playable Pinnace from a 0% win rate to 13%.

The base radius was raised from 23 to 26.5 at the same time. Most hulls afloat are
smaller than standard, so scaling alone quietly cut the whole fleet's hit rate — this
keeps the relative evasiveness while restoring the absolute rate.

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

| Hull | Tier | Behaviour | Guns | Toughness | Draught | Role |
|---|---|---|---|---|---|---|
| **Pinnace** | 1 | skirmisher | 2 | 0.26 | 0.30 | Swarm fodder |
| **Royal Sloop** | 2 | skirmisher | 3 | 0.42 | 0.40 | Fast irritant that will not be shaken |
| **Fluyt** | 2 | trader | 2 | 0.95 | 0.85 | Prize: runs, worth 26 plunder |
| **Barque** | 2 | brawler | 4 | 0.58 | 0.75 | Standard threat |
| **Frigate** | 3 | standoff | 5 | 0.80 | 0.80 | Out-reaches you and keeps her distance |
| **Brigantine** | 3 | brawler | 6 | 1.00 | 1.00 | Heavy duel |
| **Galleon** | 4 | brawler | 9 | 1.70 | 1.00 | Slow fortress; strand her on a shoal |
| *Sloop (player)* | — | — | 6 | 1.00 | 0.55 | — |

### Behaviour, not just statistics

Stats alone produce hulls that feel the same at different speeds. Each class carries a
`behaviour` that changes how its captain fights, which is what makes one encounter read
differently from another. Measured by holding the player still and watching the range
each hull chooses to keep:

| Hull | Behaviour | Range held | Volleys fired |
|---|---|---|---|
| Pinnace | skirmisher | 274 | 15 |
| Royal Sloop | skirmisher | 321 | 18 |
| Barque | brawler | 348 | 15 |
| Brigantine | brawler | 385 | 7 |
| Galleon | brawler | 514 | 4 |
| **Frigate** | **standoff** | **577** | **19** |
| **Fluyt** | **trader** | **3918 and climbing** | **0** |

The Frigate holds the longest range *and* fires the most, because she uses her reach —
you cannot simply hold her abeam and trade. The Fluyt never fires at all.

### The Fluyt

A prize rather than a threat. She runs downwind the moment she sees you and carries
several kills' worth of plunder, so chasing one takes you off station while the rest of
the sea closes in.

She is deliberately **just slower than the player's Sloop**: a stern chase is winnable
but long. Faster and she could never be caught, which would make her pointless. She is
also the clearest argument for chain shot — shoot out her rigging and she cannot run,
though a pure chain build then struggles to actually sink her.

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

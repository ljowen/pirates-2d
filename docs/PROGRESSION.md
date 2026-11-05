# The run

## Choosing a ship

Every run opens at the quayside with a choice of hull. `R` returns there rather than
restarting the same ship, so trying a different one never means reloading.

These are a **separate roster from the enemy classes**. The enemy Brigantine and Galleon
are tuned to be *fought*; reusing them would import boss numbers into the player's hands.
They share only names and silhouettes.

| Hull | Guns | Timbers | Handling | Draught | Plays like |
|---|---|---|---|---|---|
| **Sloop** | 6 | 1.00 | baseline | 0.55 | The honest choice; a well-drilled crew |
| **Pinnace** | 5 | 0.78 | turns 50% faster | **0.22** | Live in the shoals where heavies cannot follow |
| **Brigantine** | 7 | 1.15 | sluggish | **1.00** | No escape route, so turn into it and out-shoot it |
| **Fluyt** | 4 | 1.30 | slow | 0.80 | Sweep plunder from 2.1× further; out-level your problems |

The choice reaches into every system already built — draught decides whether the shoals
are a refuge or a wall, turn rate decides whether battle sails are worth it, weight of
shot decides whether you can stand and fight. The same sea plays as three different
games.

The Sloop's multipliers must stay at 1.0, since every other number is balanced against
them, so her signature lives in `playerMods` instead — a seam for abilities that apply
only to the player's own ship.

Measured across 32 seeds each:

| Hull | Win rate | Median | Avg level |
|---|---|---|---|
| Sloop | 19% | 432s | 11.5 |
| Pinnace | 13% | 386s | 12.3 |
| Brigantine | 16% | 436s | 8.8 |
| Fluyt | 19% | 442s | 11.3 |

A 13–19% spread: none dominant, none unplayable. Getting there took two corrections worth
recording. The Brigantine first came in at **67% against the Sloop's 25%** — strictly a
better Sloop rather than a different one, because weight of shot was not paid for. And
the Pinnace sat at **0%**, which turned out to be half a harness problem: the test pilot
never used shoals, so it measured a shallow-draught hull's weaknesses without its entire
strategy.

## Timed survival

Timed survival. You sail against an escalating sea for eight minutes; the clock running
out is the win condition. **Nothing persists between runs** — every run starts from a
stock Sloop — so the difficulty curve has exactly one variable to tune against. A meta
layer can be added on top later without rework; see
[plans/progression-meta.md](plans/progression-meta.md).

## The loop

```
wrecks → plunder → levels → three-card draft → ShipMods → stronger ship
```

Each card does nothing but edit `ShipMods`, which is why the progression layer never
touches the physics or the tuner.

### Plunder drifts downwind

This is the deliberate part. A prize to leeward is free; a prize to windward costs you a
beat to go and fetch while the swarm closes. It is the point where the sailing model and
the progression loop meet, and it gives the wind a job during the quiet moments between
engagements.

Mechanically: pieces scatter from a wreck, ride the surface downwind, get drawn in by a
magnet inside `plunderMagnetRadius`, and are collected inside `plunderPickupRadius`. They
blink out for the last four seconds of their life so losing one never feels arbitrary.

Values by hull: Pinnace 2, Barque 5, Brigantine 14.

### Levels

```
plunder for level N = 2 + (N − 1) × 0.9
```

Deliberately shallow — see *Balance* below for why.

## Starting upgrades

Every captain begins with one stack of **Ship's Carpenter** already fitted, before any
draft. It counts against its own max stacks and shows in both the REFIT panel and the
draft cards as already owned, so the head start is visible rather than hidden.

The Carpenter specifically, because sustain rather than firepower was what runs were
short of. Baseline repair plus one Carpenter is 0.0145 hull/s against 0.0085 on its own.

`STARTING_UPGRADES` in `sim/upgrades.ts` is a plain list of ids, so adding or changing
the opening loadout is a one-line edit.

## Coin, not experience

Plunder is money. There are no levels and no random hand of cards — you take coin from
wrecks and spend it at a shipyard on the parts you actually want.

The draft was replaced because it **diluted as the catalogue grew**: with two dozen parts
and four offered, building toward a doctrine was largely luck. And a trade you did not
choose is only a tax — deliberate purchase is what turns a cost into a decision.

### Shipyards

Harbours sit in bays on roughly 30% of islands, a fixed 62 units clear of the shore so a
laden hull can put in without grounding. Each carries a handful of parts and does not
restock, so you visit different yards rather than farming one.

**There is no safe water.** Reaching the yard is the whole cost; shopping freezes the
world, but whatever was chasing you is still there when you cast off.

This is also what finally gives the map a purpose. Terrain used to be obstacle and hiding
place; a yard upwind with a Galleon between you and it is a real decision, and the wind
and draught systems make it a hard one.

### Crew stations

A finite crew spread across four stations, adjustable **under way** — hands take a few
seconds to cross the deck, so it is a decision rather than a toggle.

| Station | Governs |
|---|---|
| Gunnery | Reload speed |
| Sails | How fast canvas changes |
| Helm | Turn rate |
| Repairs | Hull, rigging and crew recovery |

An even split at full strength is 1.0, which is what every other number is balanced
against. Manning is square-rooted, so doubling a station is worth about 40% rather than
100% — concentrating everyone on the guns should be a choice, not an obvious one.

This is what finally gives crew casualties weight: losing hands thins *every* station at
once. A ship at 55% crew reads 1.25× reload and 0.74× turn rate before anything else is
counted, so grape shot now degrades the whole vessel.

### The readout

The yard shows what she actually *does* — guns a side, damage, reload, gun range,
accuracy, top speed, turn rate, timbers, draught, burden — updating as you buy and
reassign. A deliberate system is only deliberate if you can see what you are choosing
between.

Harbours are marked on the water, and the nearest gets a bearing and range at the screen
edge, because an economy that asks you to sail somewhere specific is only a decision if
you can see where.

### Balance: unfinished

| Hull | Win rate | Median | Yard visits | Parts fitted |
|---|---|---|---|---|
| Sloop | 0% | 313s | 4.0 | 8.1 |
| Pinnace | 0% | 304s | 2.8 | 7.3 |
| Brigantine | 13% | 327s | 0.9 | 3.5 |
| Fluyt | 13% | 315s | 4.2 | 9.6 |

The economy turns over — roughly 300 coin a voyage funding eight or nine fittings — but
runs are markedly shorter than the draft version managed (~440s). Sailing to port costs
time the clock does not stop for.

Two things the figures are not telling us. **When to break off and make port is a
judgement call**, and the scripted pilot makes it crudely with a coin threshold; this is
the hardest thing it has ever been asked to decide. And **a slow deep hull can barely use
the economy at all** — the Brigantine reaches under one yard a voyage, which is
thematically right and possibly too punishing.

## The size of the pool

## The size of the pool

## The size of the pool

Twenty-four cards, **around 70 stacks** reachable in one run (57 across all cards, less the two shot
types exclusivity locks out). A playtested run reaching level 37 held 36 of them, so a
long endless run can get within sight of exhausting the draft.

When the pool runs dry the draft is simply skipped — no soft lock — and levels continue to
accrue from plunder as a score. That chaining had to be made explicit: `levelUp` returned
early on an empty hand, which stalled the counter at one level per pickup.

## Endless mode

Complete the voyage and you are offered a choice: make port, or **sail on**. Taking it
(`C`) sets `Run.endless` and the clock stops being a finish line — it starts counting up
instead, and becomes the score.

Waves arrive every `endlessWaveSeconds` (55s), each announced and each worse:

| Lever | Behaviour past the voyage |
|---|---|
| Spawn gap | `base / (1 + wave × endlessRamp)`, floored at `endlessMinInterval` |
| Enemy cap | `base + wave × endlessCapGrowth` |
| Hull mix | Slides toward Brigantines; Pinnaces never vanish entirely |
| Squadron | Each wave opens with `min(1 + wave/2, 4)` Brigantines and `min(wave, 4)` Barques |

Measured escalation:

| Wave | Spawn gap | Enemy cap | Opening squadron |
|---|---|---|---|
| 0 (voyage end) | 2.6s | 6 | — |
| 1 | 1.7s | 8 | 2 hulls |
| 3 | 1.0s | 12 | 5 hulls |
| 6 | 0.65s | 18 | 8 hulls |
| 10+ | 0.6s (floor) | 26+ | 8 hulls |

Counts are capped deliberately: past a point more hulls stop adding difficulty and only
add load. Beyond the cap, escalation comes from the shrinking spawn gap and the heavier
hull mix instead.

The scripted pilot survives **60–127 seconds** of overtime, reaching waves 2–3. The end
card reports overtime survived and wave reached alongside the usual figures.

## Baseline repair

The player repairs slowly on all three tracks even without drafting anything. Without it,
attrition over an eight-minute run is one-way and the back half is unplayable. It also
makes **breaking off downwind to recover** a real strategy, which is exactly the kind of
wind-driven decision the game wants to exist.

| Track | Rate | Why |
|---|---|---|
| Hull | 0.0085/s | Slowest — hull damage should stay frightening |
| Rigging | 0.026/s | Permanently shredded rigging means never escaping anything again |
| Crew | 0.016/s | Restores reload speed and sail handling |

Crew recovery was missing entirely at first: it was the one wound that never healed, so a
long run bled gunnery and handling away permanently with no way back.

## The spawn director

Hull mix, spawn rate and enemy cap are all expressed against **run progress** rather than
absolute seconds, so changing the run length in the tuner rescales the whole curve instead
of breaking it.

| | Start | End |
|---|---|---|
| Spawn gap | 7.0s | 2.6s |
| Enemy cap | 2 | 6 |

**These two levers are more separable than they first appear.** The spawn gap governs how
much plunder flows in; the enemy cap governs how much is shooting at you at once. Lowering
the cap eases survival without starving the draft, as long as the player is killing fast
enough to stay under it. This is the main survivability dial.

Hull mix over the run. Each tier fades in at its own point, so the sea's character
changes rather than merely getting busier: skirmishers early, brawlers through the
middle, long-ranged and heavy hulls late.

| Hull | Appears from | Measured share |
|---|---|---|
| Pinnace | 0% | 53% |
| Barque | 22% | 21% |
| Royal Sloop | 12% | 8% |
| Fluyt | 8% | 6% |
| Frigate | 40% | 6% |
| Brigantine | 56% | 5% |
| Galleon | 72% | 1% |

Barques are deliberately held back — they are a serious threat and must not arrive before
the draft has.

**Traders do not count toward the enemy cap**, and one that runs far enough is removed
from the world. The cap exists to limit *pressure*, and a Fluyt is an opportunity rather
than pressure. Counting them let a few fleeing traders occupy the cap, crowd out killable
targets and quietly starve the run — win rate fell from 31% to 19%, with Fluyts present
in nine of ten deaths, before this was corrected.

### Boss waves

| At | Wave |
|---|---|
| 34% | A Brigantine |
| 60% | A Frigate and two Barque escorts |
| 88% | A Galleon, a Frigate and two Barques |

**Escalation adds escorts rather than more Brigantines.** Multiplying a fair fight does
not scale — a Brigantine stays dangerous however strong the player gets, so two of them
was a wall that every measured run broke on. Worse, spawn suppression only stops *new*
hulls rather than clearing the sea, so "two Brigantines" in practice meant two Brigantines
plus whatever was already in pursuit.

**While a boss is afloat, the sea thins out around her** — the cap drops to the number of
bosses and the spawn gap doubles, rather than stopping outright. Stopping entirely
starved the run: a flagship that lived two minutes meant two minutes with no plunder, no
levels and none of the roster. A Brigantine is a fair duel on its own
terms; fought with four other hulls still arriving it is just a wall, and the fight that
was tuned and signed off never actually happens. Boss waves are announced on screen,
because three Brigantines appearing over the horizon unheralded is simply a sudden death.

## Balance: honest state

Measured with a scripted pilot across 8 seeds, auto-drafting by a fixed priority list:

| | |
|---|---|
| Median survival | **480s — the median run now completes** |
| Win rate | **50%** (16 seeds) |
| Average level reached | 12.4 |

Tuning history, same harness and seeds:

| Change | Median | Win rate |
|---|---|---|
| Baseline | 303s | 0% |
| + starting Carpenter | 315s | 0% |
| + escorts instead of 2 Brigantines | 318s | 0% |
| + enemy cap 9 → 6 | 310s | 0% |
| + slower shot, crew recovery, lighter water | 340s | 13% |
| + converged firing solution, 4 draft cards | 439s | 10% |
| + exclusive shot types, Topmen fix | **480s** | **50%** |

The final row was not intended as a difficulty change and deserves scrutiny. The most
likely cause is that exclusivity removed wasted picks: the test pilot ranks shot cards
low but did sometimes take two opposing ones, spending draft slots on a net-zero result.
With that impossible, every pick is productive. This has not been isolated conclusively.

**The voyage may now be too easy**, at 50% for a crude bot. If so, the levers are the
final boss wave, `enemyCapEnd`, or `runDuration`. The counter-argument is that endless
mode now carries the challenge: the voyage is a campaign you can beat, and sailing on is
where the difficulty actually lives.

**Confirmed by playtest:** a human completes runs at this tuning. The bot is a floor, not
a verdict — it wins roughly one run in ten, and a player clears it comfortably more often.
The curve can be treated as working; future content should be tuned to preserve this shape
rather than rebuilt from scratch.

The spread is tight and progression is steady, so the curve itself is working — but the
run is **not yet finishable by an automated pilot**.

Two caveats before reading too much into that. The test pilot never disengages to repair,
never prioritises targets, and drafts by a fixed list rather than building synergy. But
adding sail management and disengage-to-repair behaviour to it changed nothing, so the
remaining gap appears to be balance rather than bot skill.

**This needs human playtesting.** See [plans/balance.md](plans/balance.md) for the levers
and the leading hypotheses.

> One finding worth keeping, because it cost several tuning passes: **softening the spawn
> curve does not help on its own.** Fewer enemies also means less plunder and a slower
> draft, so both curves move together. The only lever that reliably helps the player is
> levelling faster than the sea escalates.

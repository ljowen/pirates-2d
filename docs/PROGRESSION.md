# The run

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

## The draft

Fifteen upgrades across four groups. **Four cards offered** (`draftCards`), drawn weighted
and without replacement, excluding anything already at max stacks.

Four rather than three deliberately: with the ceiling far above the median, the difference
between runs was largely whether a useful card turned up early. More cards per hand cuts
that variance **without raising the power ceiling**, which is the right shape of fix for a
spread problem rather than a wall problem.

**Sailing**
| Card | Effect | Max |
|---|---|---|
| Rakish Lines | +12% turn rate | 5 |
| Careened Hull | −9% drag | 4 |
| Taller Masts | +10% drive | 4 |
| Veteran Topmen | +18% sail handling, +0.008 crew recovery/s | 3 |

**Gunnery**
| Card | Effect | Max |
|---|---|---|
| Heavier Shot | +16% damage | 5 |
| Powder Monkeys | −13% reload | 5 |
| Long Nines | +16% range | 4 |
| Another Gunport | +1 gun per broadside | 6 |
| Trained Gunners | −18% spread | 3 |

**Shot** — **mutually exclusive.** The first one taken locks out the others for the rest
of the run, and the card says so before you commit.
| Card | Effect | Max |
|---|---|---|
| Chain Shot | ×2.1 rigging, ×0.82 hull | 3 |
| Grape Shot | ×2.4 crew, ×0.85 hull | 3 |
| Double-Shotted | ×1.7 hull, ×0.8 others | 3 |

They were originally stackable and freely mixable, which was a silent trap. Because the
split renormalises, opposing types cancel almost exactly:

| Build | Hull | Rigging | Crew |
|---|---|---|---|
| No shot cards | 62% | 24% | 14% |
| Chain ×3 | 13% | 82% | 5% |
| Chain ×2 + Double ×2 | 61% | 34% | 5% |

Four draft picks for a ten-point shift and a gutted crew track — indistinguishable from
taking nothing. Exclusivity is enforced by an `exclusive` family tag on the card, so other
families can use the same mechanism later.

**Quarterdeck**
| Card | Effect | Max |
|---|---|---|
| Ship's Carpenter | +0.006 hull/s repair | 3 |
| Sailmaker | +0.012 rigging/s repair | 3 |
| Grappling Hooks | +55% pickup radius | 3 |

The draft **freezes the world**. A level-up is a decision, not a reflex test. Visibility
is driven purely by run state rather than by the card's own callback, so no other path out
of `drafting` can strand a stale hand on screen.

## The size of the pool

Fifteen cards, **51 stacks** reachable in one run (57 across all cards, less the two shot
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

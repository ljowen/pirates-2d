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

### A prize is worth more than a wreck

A ship that strikes her colours drops `prizeValue` (1.65) × her base value, scaled by how
intact her hull is; a ship you sink drops `sinkShare` (0.75) ×. Taken at full hull she is
worth 2.4× the wreck; battered to a third of her timbers she is barely worth more. That
is the manual's economy — a sunk ship takes her cargo down with her, and shot put into a
prize lowers what she is worth — and it is what turns chain and grape from taxes into
doctrines. See [COMBAT.md](COMBAT.md#three-pools-three-ways-to-take-a-ship).

### Two kinds of flotsam

A wreck leaves **coin** and **timber**, and they answer different questions.

| | Is | Does |
|---|---|---|
| **Coin** — a bright gold disc | Progress | Fills the experience bar toward the next draft |
| **Timber** — a pale baulk of planking | Survival | Mends the hull, spilling into rigging and then crew once she is sound |

Timber scales with the hull that went down — `value × wreckTimber`, so a Brigantine is
worth chasing when you are hurt and a Pinnace barely covers a scratch — and is split so
that a baulk is always about 7% of the hull rather than a crumb.

Keeping them apart is the whole point. One pickup that did both made every wreck worth
the same beat to windward; two make it a question — level up, or stay afloat — and since
both drift downwind from where she sank, the wind decides what each answer costs.

They are told apart by **silhouette before colour**: a coin is a small bright disc, a
baulk is long, pale and lying at its own angle across the swell. A player glancing at the
water while being shot at has to know which prize is which without reading anything, and
shape survives distance and a busy sea where a hue does not.

**It is self-limiting, which is the property that makes it work.** Timber does nothing
for a sound ship, so a run that is going well gets no benefit from it and a run that is
sinking gets all of it. That is why the rate barely moves the median: between
`wreckTimber` 0.008 and 0.015 the scripted pilot lands within 4 seconds of itself, while
the share of the run spent under 40% hull falls from 9.8% to about 4%. It helps precisely
where it should and nowhere else. The shipped value, 0.015, was chosen on how large a
baulk reads on the water rather than on the median.

### Levels

```
plunder for level N = 2 + (N − 1) × 0.9
```

Deliberately shallow — see *Balance* below for why.

## Sustain is earned, not drafted

Removing the free starting Carpenter exposed a problem that was always there: **the hull
economy was break-even by construction, so one card decided it.** Incoming damage averages
0.59 hull a minute; baseline repair gives back 0.51. A single Carpenter stack adds 0.36 —
71% of the entire baseline — and flips the sign. Measured, the scripted pilot survived
391s drafting normally and 324s refusing every repair card: **17% of the run resting on
two cards out of fifteen.**

The obvious fix is ruled out by its own measurement. Raising the baseline until the card
is unnecessary makes the card worthless — at 0.0145 the pilot scored 446s with repair
cards and 449s without. **Any flat repair rate racing a flat damage rate is either
mandatory or dead**, because the gap between them is narrower than one card's
contribution.

So sustain moved out of the draft and into play, by two routes:

- **Timber from wrecks** (above) — recovery you earn by sinking things.
- **[Heaving to](SAILING.md#furled-is-not-just-stopped--it-is-how-you-mend)** — recovery
  you earn by making sea room, paid for in tempo and gunnery.

| | Median | Refusing every repair card | Dependency |
|---|---|---|---|
| Before | 391s | 324s | **−67s** |
| Timber only | 439s | 438s | −1s |
| Heaving to only | 415s | 313s | −102s |
| **Both** | **437s** | **433s** | **−4s** |

Timber is what removes the dependency. Heaving to does not, because **the harness cannot
play it** — the pilot spends barely 2% of a run hove to even with the behaviour wired in,
since engineering the sea room is exactly the judgement it does not have. Its value has
to be judged by hand, and the arithmetic is the honest part: 118 seconds to mend under
way against 20 hove to.

The repair cards survive the change with a different job. Ship's Carpenter no longer
decides whether you recover; it decides **how long you are stopped while you do** — 20
seconds hove to at baseline against 6 with three stacks, under fire from whatever found
you. That is a stat that scales with how well the run is being played rather than one
that flips a sign, which is what it should have been all along.

## Starting upgrades

**None.** A captain puts to sea in a stock hull, so every point of a build is one the
player chose.

Runs used to open with a free stack of **Ship's Carpenter**, on the grounds that sustain
rather than firepower was what they were short of. That was true, and it is still the
cheapest thing to draft — but a free stack of the same card in every run is a head start
nobody picked, and it spent one of the Carpenter's three stacks before the first hand had
been dealt. Removing it costs the test pilot about 18s of median survival (419 → 401s).

The mechanism remains: `STARTING_UPGRADES` in `sim/upgrades.ts` is a plain list of ids,
anything in it counts against its own max stacks and shows as already owned, so an
opening loadout is a one-line edit if one is ever wanted again.

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

### What the cards do, in knots

Under the cards is the ship's own readout — top speed, helm, reload, weight of fire, where
the shot falls, what the quarterdeck mends — and pointing at a card runs that readout
forward to show exactly what taking it would do, old value beside new.

The cards are written in multipliers because that is what an upgrade *is*. "Weed scraped
off: 9% less drag" is true and tells the player nothing about whether it beats another
gunport. `sim/stats.ts` closes that gap by solving the same arithmetic the physics and the
gunnery run — the steady-state speed where thrust and drag cancel, the renormalised shot
split, guns × damage ÷ reload — so a card's claim and the sea's behaviour cannot drift
apart.

A few rows are derived rather than stored, and earn their place:

| Row | Why |
|---|---|
| Top speed | The positive root of `a·v² + b·v = thrust`, so drag and drive cards are comparable in knots |
| Weight of fire | Broadside ÷ reload — the only row that answers "more damage or faster reload?" |
| Broadside | As a share of a standard hull: 33% means three broadsides to sink a Brigantine |
| Mend hull / rigging / crew | Seconds to mend from nothing, so a repair card is a time rather than a rate |

The preview applies the card to a **copy** of `ShipMods`. That is only possible because
`apply` was kept to a pure edit of that struct and nothing else — a preview is the same
function run somewhere harmless. Shot-placement rows are marked as having no better
direction: more weight into the rigging is a different plan, not a better one, and
colouring it green would be a lie.

Everything is quoted for a sound ship in a steady breeze — full canvas, whole rigging,
fresh crew. Those are the only conditions under which two builds compare honestly.

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

*Re-measured since, 16 seeds, default Sloop:* the table above is stale — the hull roster,
the coin economy and the shipyard all landed after it was written. The same harness now
reports **419s median, 6% win rate** before the changes below, which is the figure the
next two rows are measured against.

| Change | Median | Win rate |
|---|---|---|
| Re-measured baseline | 419s | 6% |
| − starting Carpenter | 401s | 0% |
| + broadsides fire together | **417s** | 0% |

The volley change was asked for as a feel change and benchmarked because feel changes have
form here (see [TUNING.md](TUNING.md)). It gave back most of what the Carpenter's removal
cost, which is within noise at this sample size but at least is not a hidden nerf — every
ball still leaves the ship, simply inside 0.043s rather than 0.186s.

The final row of the historical table was not intended as a difficulty change and deserves
scrutiny. The most
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

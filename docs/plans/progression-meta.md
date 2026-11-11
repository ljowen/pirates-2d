# Plan: meta progression

What makes someone start a second run.

**State:** the first layer is in. Plunder is banked as doubloons when a voyage ends and
spent at the quayside on hulls — see [The yard](../PROGRESSION.md#the-yard). Everything
below the deep dive is the older plan, kept for its reasoning and re-ordered against it.

## Deep dive: what the game has, and what it is missing

### The run is a good roguelite run already

Measured against the usual checklist, a single voyage is in better shape than the docs'
"nothing to come back for" suggests:

| A run needs | Here |
|---|---|
| A build that differs each time | Draft of 14 cards, four offered, exclusive shot doctrines |
| A choice before the first second | Four hulls that play as different games |
| Escalation with punctuation | Director curve plus three announced boss waves |
| A way to lose that is your fault | Heaving to is the only sustain — every death is a stop you did not make |
| A reason to continue after winning | Endless waves |

What is missing is everything *between* runs. A voyage ends, the card says SUNK, and the
next one is identical in what it offers. Death costs nothing because the run was worth
nothing, and that cuts both ways: a bad run is painless, and a good one is weightless.

### What the harness says the first hour looks like

`npm run bench`, 16 seeds a hull, scripted pilot (a floor, not a verdict):

| Hull | Win | Median | Level | Plunder, low–median–high |
|---|---|---|---|---|
| Sloop | 13% | 318s | 8 | 9 – 34 – 70 |
| Pinnace | 6% | 313s | 7 | 5 – 30 – 92 |
| Brigantine | 6% | 343s | 6 | 2 – 21 – 44 |
| Fluyt | 6% | 314s | 6 | 5 – 20 – 36 |

Two things fall out of that. The median first voyage **dies two thirds of the way
through**, shortly after the Frigate wave — so the game already opens as one you lose, which
is the right shape for a roguelite and wants only a reason to go again. And plunder is the
one figure with real spread (a 10× range on the same hull), which makes it the right thing
to pay out: it rewards playing well rather than merely lasting.

### Three jobs a meta layer has, in the order they should be built

**1. Make the end of a run a beginning.** The end card has to name something within reach.
Not "you earned 340" but "you are 60 short of the Pinnace". This is the cheapest job and
the one that decides whether there is a second run at all. *Done — the yard.*

**2. Widen before deepening.** New hulls and new cards change what a run *is* without
changing how strong the player is, so they cost nothing in balance. Permanent stat bonuses
are the stronger hook and the more dangerous one: they turn every measurement in these docs
into a measurement of one particular save file. Both are wanted — the brief is an arc from
prey to predator, and no amount of *variety* is a power fantasy — but width comes first and
depth has to be bounded and has to be an input the harness can set.

**3. Raise the ceiling as the floor rises.** Permanent power with a fixed sea is a game that
gets easier until it is boring. Every roguelite that lasts pairs its power track with a
difficulty track the player climbs deliberately (Hades' heat, Slay the Spire's ascension):
the sea gets worse *because* you beat it, and pays better for being worse. Without this the
arc is prey → predator → nothing.

### The arc, concretely

| Stage | Voyages | What it should feel like | What carries it |
|---|---|---|---|
| Prey | 1–5 | Stock Sloop. A Brigantine is a fair fight and you are not ready for a fair fight; the Frigate and the Galleon are things to *leave*. Dying at 5:00 is normal. | The existing curve, plus a HUD that says plainly which sails to run from |
| Contender | 5–15 | A second and third hull, the first refits. The boss waves become fights rather than weather. First completed voyage. | The yard, the first ranks of permanent refits |
| Predator | 15–40 | Voyages are completed more often than not at the base difficulty, so the base difficulty stops being the game. | Top hulls, deep refits, new cards — against a notoriety ladder that keeps the sea ahead of you |
| Legend | 40+ | The thing that hunted you in the first hour is now the thing you hunt. | Notoriety's upper rungs, feats, endless as the score attack |

### What the first layer does and does not do

The yard is job 1 and the cheap half of job 2, and deliberately nothing else. The three
locked hulls are **sidegrades**: the harness puts all four within seven points of each
other, so a captain with a full yard is no stronger than a new one — only better equipped
to choose. That keeps every balance figure in the docs valid, and it means the first layer
could ship without re-tuning anything.

It also means the yard alone does not deliver the arc. Three purchases, about ten voyages
for the scripted pilot and fewer for a person, and it is spent. The remaining work — the
part that turns this from an unlock list into a progression — is jobs 2 and 3 above:
permanent refits, new cards, and a difficulty ladder to keep the sea ahead of them.

### Decisions taken in the first layer, and why

- **Doubloons are plunder × 10, banked at the end, not a second pickup.** One thing to
  collect, counted twice. A separate meta-currency floating in the water would ask the
  player to choose between this run and the next one every time something sank, and the
  in-run draft would lose every one of those arguments.
- **Sinking keeps the haul.** Only the 250 voyage bonus is reserved for finishing. A
  roguelite that pays nothing for a death teaches the player to stop at the first bad
  draft; paying for what was actually hauled makes a losing run still a step.
- **Abandoning keeps it too.** Otherwise `R` is strictly worse than sailing onto a beach,
  and the game should never make scuttling the correct input.
- **The payout is a function of the run, not an event.** A voyage can end twice — home, and
  then sunk in overtime — so the ledger pays `owed − already paid` whenever asked. There
  is no "which ending counts" to get wrong, and it is settled the frame the run ends
  rather than on the next keypress, so closing the tab on the end card costs nothing.
- **Prices are set against the pilot's haul, as a ceiling on patience.** At a median of
  200–340 doubloons a voyage, the Pinnace (400) is one or two runs out for the worst
  captain the game will ever have, the Fluyt (900) three or four, the Brigantine (1,600)
  half a dozen more. A person hauls several times that.
- **`meta/` is not `sim/`.** The simulation stays a pure function of seed and hull. The
  career decides what a run starts with and reads what it ended with, and never reaches
  inside one — which is what will let permanent power be added later as an explicit input
  to the harness rather than as ambient state that quietly invalidates it.

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

## 2. Unlocks — **hulls done**

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

## What not to do carelessly

Persistent power bonuses make the starting state variable, and every balance measurement
in these docs assumes a stock hull. That is not a reason to leave them out — the arc needs
them — but it sets the condition for adding them: the career has to be an explicit input
to `simulateRun`, benchmarked at a fresh save and at a full one, so that "the curve" is
always the curve *for a stated career* rather than for whoever last played in that browser.

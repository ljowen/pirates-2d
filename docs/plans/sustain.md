# Plan: health and healing

**Status: resolved. Options 1 and 3 shipped** — timber salvaged from wrecks, and heaving
to to mend. Raised after the free starting Carpenter was removed and runs became hard to
survive unless one was drafted — which was the symptom, not the problem.

**Outcome, 32 seeds:** the run's dependency on drafting a repair card fell from −67s to
−4s, median survival rose 391 → 437s, average level 9.8 → 11.9, and the share of a run
spent under 40% hull fell from 9.8% to 3.3%. Timber did the work; heaving to is
unmeasurable by the harness and has to be judged by hand. See
[PROGRESSION.md](../PROGRESSION.md#sustain-is-earned-not-drafted) for the shipped design
and [SAILING.md](../SAILING.md#furled-is-not-just-stopped--it-is-how-you-mend) for the
heaving-to rules.

Options 2, 4 and 5 below were **not** taken and are kept because they are still live
ideas — option 2 especially, which is a combat question wearing a sustain question's
clothes.

## The diagnosis

The hull economy is break-even by construction, so one card decides it.

Measured over 32 seeds with the scripted pilot, default Sloop:

| | hull per minute |
|---|---|
| Incoming damage, averaged over a run | **0.59** |
| Baseline repair (`playerHullRepair` 0.0085/s) | **0.51** |
| **Net** | **−0.08** |
| One stack of Ship's Carpenter (+0.006/s) | **+0.36** |
| **Net, with one Carpenter** | **+0.28** |

A single card is worth 71% of the entire baseline repair rate, and it flips the sign of
the attrition equation. That is not an upgrade, it is a prerequisite — and the run
measures it:

| | Median | Win | Avg level | Share of run under 40% hull |
|---|---|---|---|---|
| Pilot drafts normally | 391s | 13% | 9.8 | 9.8% |
| **Pilot refuses every repair card** | **324s** | 16% | 9.0 | 11.5% |

**−67 seconds, 17% of the run, resting on two cards out of fifteen.**

### The corollary that rules out the obvious fix

Raising the baseline so the Carpenter is no longer needed does work — and makes the
Carpenter worthless. At `playerHullRepair` 0.0145 the pilot survives 446s with repair
cards and 449s without: the cards have become a wasted pick.

That is the real finding. **Any flat repair rate competing against a flat damage rate is
either mandatory or dead**, because the margin between them is far narrower than one
card's contribution. The fix is not a better number. It is to stop expressing sustain as
a trickle that races a drain, and to make recovery something the player *earns*, with a
dynamic range wide enough that a card can scale it instead of deciding it.

## Options

All medians are the scripted pilot, which is a floor rather than a verdict. The column
that matters is the last one: how much the run still depends on drafting a repair card.
16-seed medians move ±40s between batches, so only the 32-seed rows and the large gaps
below should be trusted.

| Option | Median | Win | Without repair cards | Dependency |
|---|---|---|---|---|
| Current | 391s † | 13% | 324s † | **−67s** |
| 1. Plunder mends her (+ baseline 0.012) | **458s** † | **38%** | 439s † | −19s |
| 2. Rigging and crew are the renewable pool | 432s † | 13% | 415s † | −17s |
| 3. Heave to and mend (×10 with canvas off) | 441s | 19% | 427s | −14s |
| 4. Fold the Carpenter into the hull | 446s | 13% | 449s | ~0, *card now dead* |
| 5. Repair scales with crew | 441s | 13% | 440s | ~0 |
| Each draft mends 15% | 456s | 44% | 399s | −57s |

† 32 seeds; the rest 16.

### 1. Plunder mends her — *recommended as the economy*

Every piece of plunder swept up patches the hull as well as filling the experience bar.
The prize crew brings over timber, cordage and stores, which is what taking a prize was
actually for.

- **It reinforces the loop the game already has.** You chase plunder; now a prize to
  windward is a sustain decision as well as a progress one, and the wind decides what it
  costs you.
- **It is self-balancing.** You recover by sinking things, so a run that is going well
  stays well and a run that is going badly is already in trouble. That is the shape a
  survivors game wants.
- **It is earned, so a card can multiply it** rather than replace it.
- **Risk:** plunder now does two jobs, and the rich get richer. A player who is losing
  heals less, which is correct for the genre but punishing at the margin.

Measured best of everything tried: 458s median, 38% win, level 11.7, and the share of
the run spent under 40% hull falls from 9.8% to 4.5%.

### 2. Rigging and crew are the renewable pool; hull is the life bar

Change where shot lands — 35% hull, 40% rigging, 25% crew instead of 62/24/14 — and raise
damage to compensate. Rigging already mends in 38 seconds against the hull's 118, so this
makes the *fast* pool the one that absorbs most of the punishment and turns the hull into
a slow, meaningful resource that mostly only goes down.

The most interesting option structurally, and the one that changes the fiction least: a
ship in a running fight loses her canvas and her people, and only gradually her timbers.

- **It removes the dependency outright** without touching repair rates at all.
- **It changes combat, not just survival.** Kills fall 12% (32.7 → 28.6 a run): fights
  become dismast-then-finish rather than hull-down. Very *Pirates!*, but it is a real
  change in what a fight feels like, not a tuning tweak.
- **Knock-on work:** the three shot-type cards are defined against the current split and
  would all need re-reading; enemies never repair, so permanent rigging damage on them
  compounds differently than on the player.

### 3. Heave to and mend — *recommended as the skill*

A fourth order below Furled, or simply a consequence of furling: take the way off her and
the hands leave the yards for the pumps. Repair runs several times faster while the canvas
is off, and you are a sitting target while it does.

This is the option that fits the game's identity. Every other system here is about
choosing where to be; this makes recovery the same kind of decision — break contact, find
the lee of an island where a deep hull cannot follow, and pay for it in tempo.

**The harness measures it badly and should be ignored here.** At ×6 the pilot gets 444s
with repair cards and 309s without, because it almost never engineers the sea room the
option requires; at ×10 the gap closes to 14s. Deciding when to break off is precisely
the judgement the bot does not have. This one needs playing, not benchmarking.

### 4. Fold the Carpenter into the hull

`playerHullRepair` 0.0085 → 0.0145, one line. Honest and minimal: 446s, dependency gone.
The cost is that the Carpenter and the Sailmaker become near-dead cards, so the draft
loses two of its fifteen. Worth doing only as a stopgap, or alongside rewriting both cards
as multipliers.

### 5. Repair is crew work

Repair rate scales with how many hands are left (`0.25 + 0.75 × crew`). Does not fix the
economy on its own — 441s, within noise of the current 391–446 band — but it gives the
crew pool a third job, makes grape shot genuinely frightening, and makes mending something
an enemy can take away from you. A companion to 1 or 3, not a fix.

## Ruled out by measurement

**Repair only once you are out of fire.** Gating repair on seconds since the last hit (8s
lull, ×3 rate) collapsed the run to 310s from 391. In the back half of a survivors game
you are never clear for eight seconds, so it deletes sustain exactly when it is needed.
The intuition — "you should have to break off to mend" — is the right instinct, but it
belongs in option 3, where breaking off is a thing you *choose* and are rewarded for,
rather than a condition you are passively judged against.

**A heal on every draft.** 456s and a 44% win rate, the second-best number here, and the
least interesting mechanic in the list: a free mend on a clock the player does not control,
landing at the moment the game is already pausing to congratulate them. It also leaves the
largest dependency of any option that helped (−57s), because the heal arrives on the
level-up curve rather than when the ship is actually hurt.

## What shipped

Options 1 and 3, with one refinement to option 1 that improved it: rather than *every*
piece of plunder mending the hull, a wreck leaves **two kinds of flotsam** — coin for
progress, timber for survival. That keeps the two currencies legible on the water and
turns a wreck into a question (level up, or stay afloat?) instead of a single pickup that
quietly did both.

The repair cards were left alone — the rewrite turned out to be unnecessary. Heaving to multiplies `mods.hullRepair` along with everything else, so the
Carpenter already scales with the mechanic: it went from deciding *whether* you recover to
deciding *how long you are stopped* doing it, 20 seconds hove to at baseline against 6
with three stacks. That is the scales-with-play property the rewrite was for, obtained for
free.

One change was made to the harness alongside, under the standing rule from
[TUNING.md](../TUNING.md) that a proxy missing a skill the real player has reports that
skill's absence as difficulty: the pilot now heaves to when hurt with sea room. It is a
crude version — a fixed range threshold where a human reads the situation — and it still
only manages 2% of a run hove to.

## Recommendation (as written before building)

**Options 1 and 3 together, with the repair cards rewritten as multipliers.**

Plunder mending the hull gives the economy a floor that is earned rather than granted;
heaving to gives the skilled player a lever the bot cannot pull; and once sustain comes
from play, Ship's Carpenter multiplying both (×1.25 a stack, say) scales with how well the
run is going instead of deciding whether it survives at all. Option 5 folds in cheaply if
crew damage should bite harder.

Option 2 is the most interesting idea on this page and the biggest change. It is worth
prototyping on its own terms rather than as a sustain fix — the question it really asks is
whether fights should be about dismasting, which is a combat question.

## Method note

Everything above was measured by patching a scratch copy of `src/`, never the tree. The
decisive comparison is not a median but a *pair* of medians — the pilot drafting normally
against the same pilot refusing repair cards. A single median cannot tell a game that is
balanced from one that is balanced on a card.

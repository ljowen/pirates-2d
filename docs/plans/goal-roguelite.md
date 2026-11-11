# Goal: a roguelite worth a hundred voyages

**The goal.** A fun, replayable game with plenty to unlock, whose first hour is spent
running from things and whose fortieth is spent hunting them — and which is still able to
sink you at the end.

That is three claims, and each has a test.

| Claim | Test | State |
|---|---|---|
| **It starts as prey.** | A first voyage in a stock Sloop meets ships it cannot fight, is told so, and usually loses. | Met — see *The arc, measured* |
| **It ends as a power fantasy.** | A captain with everything bought completes the base voyage nearly every time, and sinks the ship that used to hunt them. | Met |
| **…with some challenge left.** | The same captain, at the top of the notoriety ladder, usually loses. The ladder between is monotonic. | Met for the pilot (94% → 13%); a person will need the top rungs to be harder |
| **Plenty to unlock.** | Dozens of voyages of things to buy or earn, each of which changes what a voyage is. | 7 hulls, 10 refits (40 ranks), 6 earned cards, 12 feats, 10 rungs — roughly 58,000 doubloons |
| **Progression gets harder.** | Each purchase costs more than the last; each rung of notoriety is worse than the last and is only opened by beating the one before. | Met |
| **Fun and replayable.** | A person wants another voyage after the end card. | **Not measurable by the harness. Needs playing.** |

The last row is the one that matters and the only one a script cannot fill in. Everything
below is in service of making it likely.

## The shape, borrowed

Nothing here is original, which is the point: these are the structures that roguelites
converged on because they work.

| Borrowed from | What | Here |
|---|---|---|
| *Hades* — the mirror | Small permanent ranks bought between runs | **Refits** |
| *Hades* — heat; *Slay the Spire* — ascension | A difficulty ladder the player climbs on purpose, opened one rung at a time, that pays more | **Notoriety** |
| *Vampire Survivors* — achievements unlock weapons | Doing a thing once puts new content in the pool | **Feats** open cards and hulls |
| *Vampire Survivors* — reroll, banish | Buying down draft variance | **Quartermaster** redraws |
| *Rogue Legacy* — the manor | The death screen is a shop | **Port**, and an end card that names the next purchase |
| *FTL* — the rebel fleet; *Spelunky* — the ghost | Something you cannot fight, on a clock, that makes you move | **The Man-o'-War** |

## What is built

### Port

One screen between voyages, three pages: **Shipyard**, **Refits**, **Captain's log**. See
`src/ui/port.ts`. Nothing is ever hidden, only dimmed with its price or its condition on
it — a thing the player cannot see is a thing they cannot want.

### Two currencies, and why two

**Doubloons buy; feats permit.** A purse alone makes progression a price list, and a price
list is ground through in the order of cheapest first. Feats break that up: the Galleon is
not for sale until a Galleon has been beaten, and the card about taking prizes is not in
the draft until a prize has been taken. Each one names the next thing worth *trying*, which
is a better reason to put to sea than a number going up.

### Refits — permanent power, bounded

Ten refits, 40 ranks, carried on every hull: timbers, reload, shot, sailcloth, rudder,
mending, barrels, and three that act outside the hull (a deeper hold, draft redraws, a
head-start level). Each rank is 4–7%, each costs ×1.7 the one before, and a full set comes
to about 26,000 doubloons.

This is the thing the earlier plan said to be careful about, and the care taken is
structural rather than numerical: **the career never touches a run.** It is boiled down to
a `Voyage` (`src/sim/voyage.ts`) at the quayside, and a run is a function of
`(seed, hull, voyage)`. The harness can therefore be handed any career it likes, and every
figure in this document says which one it was measured for.

### The capital hulls — earned twice

The first four hulls are sidegrades within a few points of each other. The Frigate, the
Galleon and the Man-o'-War are not: they are simply better, they are the back half of the
arc, and each is gated by a feat done at sea *and* a price that takes many voyages to
raise. You build a Galleon after you have beaten one.

### The Man-o'-War — the thing to run from

About a minute into every voyage a ship of the line arrives with the player's name on her
orders. Against a stock hull she is four times the broadside behind two and a half times
the timbers. She is not a fight, and the game says so: any ship with more than 1.6× the
player's power is labelled **☠ RUN** on the water and gets a larger, hotter arrow at the
edge of the screen.

She is beaten the way the sailing model always said a heavy ship is beaten — she is slower
than anything the player starts in, turns like a continent and draws so much water that
any bar stops her (time aground counts double against her). And she is on a clock rather
than a leash: after 55 seconds, longer with notoriety, she hauls her wind and leaves.
Outlasting her pays plunder on the spot and a bounty at the end, because a minute spent
running is a minute of wrecks not made — measured, a captain who slipped her cleanly and
was paid nothing arrived at the Brigantine two levels short and died to that instead.

Nothing about her changes over a career. Forty voyages later the same ship arrives with
the same numbers and no warning label, and she is the richest prize on the sea. **The arc
is entirely in what the player has become**, which is why she is the centre of it.

### Notoriety — the ceiling rises with the floor

Ten rungs. Completing a voyage on the top open rung opens the next; stepping down is
always allowed. Each rung makes enemy hulls 15% harder to sink and their shot 8% heavier,
advances the hull mix, adds escorts to the boss waves, keeps the hunter out longer and —
from the fourth — sends her twice. Each pays 30% more.

The levers are chosen from a finding already in PROGRESSION.md: more hulls is also more
plunder and a faster draft, so spawn rate is a poor difficulty lever on its own. Notoriety
leans on the levers that do *not* pay the player back.

### Earned cards

Six cards gated behind feats, taking the pool from 14 to 20. Each does something no stock
card does — the rule Careened Hull was deleted for breaking — so earning one changes which
builds exist: Carronades (damage for range), Storm Canvas, Iron Knees (the only damage
reduction in the draft), Prize Crews, Letters of Marque, Boarding Axes.

## The arc, measured

`npm run bench`, scripted pilot, 16 seeds a row. The pilot is a floor — a person does
better at every stage — so read the *shape*.

| Career | Win | Median | Level | Plunder | Hunter: slipped / beaten / died to |
|---|---|---|---|---|---|
| Sloop, first voyage | 13% | 197s | 6 | 23 | 12 / 0 / 4 |
| Sloop, a third of the refits | 44% | 458s | 11 | 64 | 14 / 0 / 2 |
| Brigantine, half | 25% | 439s | 11 | 65 | 14 / 0 / 2 |
| Frigate, three quarters | 75% | 480s | 14 | 102 | 14 / 3 / 0 |
| Galleon, everything | 94% | 480s | 13 | 81 | 10 / 8 / 0 |
| Man-o'-War, everything | 94% | 480s | 11 | 66 | 9 / 8 / 0 |
| Man-o'-War, everything, notoriety 5 | 63% | 480s | 16 | 126 | 9 / 13 / 0 |
| Man-o'-War, everything, notoriety 10 | 13% | 261s | 10 | 47 | 4 / 6 / 6 |

The first voyage at 32 seeds: **9% win, 241s median**, 24 of 32 slipping the hunter.

Up the ladder with everything bought (`npm run bench -- 16 ladder`):

| Notoriety | Frigate | Man-o'-War |
|---|---|---|
| 0 | 88% | 94% |
| 2 | 63% | 94% |
| 4 | 31% | 69% |
| 6 | 6% | 50% |
| 8 | 0% | 25% |
| 10 | 0% | 13% |

Read across: a first voyage is short and usually lost; a third of the refits roughly
doubles how long she floats; by the capital hulls the base voyage is a formality and the
Man-o'-War is being sunk rather than fled; and the ladder takes it all back, one rung at a
time, until at the top a ship of the line with every refit loses seven voyages in eight.

## What is not done

In rough order of how much each would add.

- [ ] **Play it.** Every number here is a floor measured by a bot that cannot use shoals
      against the hunter, which is the intended answer to her. The first voyage in
      particular needs a person: it is meant to be lost, and whether losing it is *fun* is
      not something the harness can say.
- [ ] **Tune prices against a person's haul.** They are set against the pilot's (130–250
      doubloons on a first voyage). A person may clear the cheap refits in an evening.
- [ ] **The hunter needs her own look and sound.** She is a recoloured hull and a banner.
      The thing the whole arc turns on should be recognisable at the edge of the screen —
      a silhouette, a drum.
- [ ] **A reason to pick a small hull late.** Once the Man-o'-War is owned the Pinnace is
      dead content. Per-hull feats, or notoriety modifiers that favour draught and speed,
      would keep the roster alive.
- [ ] **More draft content at the top.** A full career reaches level 15+ and starts to see
      the bottom of the pool. The combat-refinement plan is where this comes from.
- [ ] **Notoriety that changes the sea rather than only its numbers.** Rungs that add a
      rule — fog, a second hunter who cuts you off from the shoals, a blockade — would be
      remembered in a way that "+15%" is not.
- [ ] **Feats visible at sea.** They are judged when the voyage ends. A banner the moment
      one is done would land better.
- [ ] **Export and import of a career.** It lives in one browser's `localStorage`.
- [ ] **The ladder's middle is steep for the Frigate.** She falls off around rung 4 while
      the Man-o'-War holds to rung 6, so the capital hulls are a strict ladder rather than
      a choice.

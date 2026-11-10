# Design decisions

A record of choices that shaped the project, and why. Where a decision was reversed or
corrected, that is recorded too — the correction is usually the more useful half.

## The premise

**The fusion is "you steer, the cannons fire themselves, the wind is your dodge
mechanic."** Vampire Survivors is one-input movement with automatic weapons; Pirates!
sailing is movement constrained by wind. They compose: positioning becomes simultaneously
a wind question and a swarm question.

Everything else follows from this. It is why the sailing model was built and tuned before
anything was shot at, and why guns auto-fire.

## Fidelity to Pirates!

Fidelity is a design constraint, not flavour. Mechanics derived from *Pirates!* are
grounded in the actual game rather than general impression, and **deliberate departures
are labelled rather than smuggled in**.

Controls come straight from the *Pirates! Gold* manual: turn left/right, raise/lower
sails. There is no sail-trim or sheeting mechanic in the original and there is none here
— Up/Down is canvas, not trim, and the crew handles trimming implicitly via the polar
curve. (An early design invented a trim layer; it was wrong and was removed.)

### Deliberate departures

| Departure | Reason |
|---|---|
| **Guns fire themselves** | The original has a fire key. This is the Vampire Survivors half of the fusion and the reason the design holds together. |
| **One shot type at a time** | The original lets you select round, chain or grape. Here shot type is an upgrade axis instead, which gives the draft meaningful content. |
| **No boarding** | A Pirates! signature, but a whole sword-fight minigame. See [plans/combat-refinement.md](plans/combat-refinement.md). |
| **Timed survival run** | Pirates! is an open-ended career. A fixed run is the proven Vampire Survivors shape and gets the loop testable. A career structure is a later option — see [plans/progression-meta.md](plans/progression-meta.md). |

## Technical

**TypeScript + PixiJS + Vite.** Web-first, instant hot reload for feel-tuning, shareable
by URL, and Pixi holds 60fps with hundreds of sprites once the swarm arrives. Pixi is
only the renderer; all simulation code is custom.

**Fixed 120 Hz timestep, decoupled from rendering.** Identical physics regardless of
refresh rate, and a simulation that can be driven headlessly — which is what made every
measured table in these docs possible.

**`sim/` imports nothing from `render/`, `audio/` or `ui/`.** See
[ARCHITECTURE.md](ARCHITECTURE.md). This caught a genuine bug, where the simulation had
come to depend on the renderer to drain its event list.

**World-up camera.** North stays fixed and the ship rotates on screen, matching Pirates!
Gold. Keeps the swarm readable and the wind arrow legible as a fixed world-space thing.

**Procedural art and audio.** No asset files at all. Feel comes out of motion long before
it comes out of sprites, and committing to an art style before the entity roster is
settled means redoing it. See [plans/art-direction.md](plans/art-direction.md).

## Sailing

**The polar curve means what it says.** A point drawn at 0.3 produces 30% of best speed.
This required squaring the multiplier on the way into thrust, because quadratic drag makes
speed scale with the square root of thrust. *Corrected after measurement showed 0.2 was
producing 40% of top speed — the tuning panel was lying.*

**Leeway is mostly lateral and scales with how badly the rig is drawing.** The rig's
forward drive is already in the polar curve, so the leftover is sideways slip. *Corrected
after the original full-strength world-space leeway blew a stalled ship astern at 40% of
top speed.*

**Firm but forgiving upwind.** Close-hauled costs about two-thirds of your speed and the
no-go zone is a soft stall you can always claw out of, never a hard wall. Best VMG sits at
60° off the wind, so pinching is punished and there is a real optimum to find.

**Battle sails are a combat tool, not a tacking tool.** They barely help you come about
(3.4s vs 4.0s) but less than half the turning radius (83 vs 186). A genuine trade-off
rather than a dominant option.

## Combat

**Shot is slow and has travel time** (~1.8s at full range), so gunners must lead and you
can see a volley coming and sail out from under it. This is the clearest expression of
"the wind is your dodge mechanic", so it is worth the shot being slower than realism would
suggest.

**The water is lighter than a realistic deep-sea blue**, and shot is drawn with a pale
underlay. Both exist so incoming fire is legible at a glance; seeing what is about to hit
you beats mood.

**Rigging damage is the keystone.** It scales drive down toward 25%, which means losing
sails means losing the ability to choose where you are — the only defence the game has.
This is what wires gunnery back into the sailing model rather than leaving them as two
separate systems.

**Shot types renormalise rather than add.** Loading chain buys rigging damage by giving up
hull damage. Keeps them choices, not bonuses.

**Enemy captains obey the same wind.** An AI that could sail straight upwind would turn
the wind into a handicap only the player pays.

**The AI pinched, and that was a bug.** It originally beat at the edge of the no-go zone
— the exact mistake the model punishes the player for — sailing at a mean of 36° off the
wind at quarter speed, unable to close with anyone. Laying off at best VMG fixed it. *The
wind model is a real system with real traps, and anything sailing in it can fall into
them.*

**The player's Sloop is exactly the tuning baseline.** An early version gave it an 8%
turn-rate edge, which silently made the Brigantine boss easier than the fight that had
been signed off. Reverted.

## Progression

**Run-scoped only.** Every run starts from a stock Sloop. One variable makes the
difficulty curve legible; a meta layer can be added later without rework.

**Plunder drifts downwind.** A prize to windward costs you a beat to fetch. This is the
point where the sailing model and the progression loop meet, and it was designed in
deliberately rather than discovered.

**The draft freezes the world.** A level-up is a decision, not a reflex test.

**Boss waves suppress routine spawns.** A Brigantine is a fair duel on its own terms;
fought with four other hulls still arriving, the fight that was tuned never happens.

**Baseline self-repair exists on all three tracks.** Without it, eight minutes of
attrition is one-way. It also makes breaking off downwind to recover a real strategy.
Crew recovery was missing at first and was the one wound that never healed.

**Shot types are mutually exclusive.** They were stackable, and because the damage split
renormalises, opposing types cancelled almost exactly — four picks of Chain and Double
produced a loadout indistinguishable from taking none. Mixing was a silent trap, and a
pick that is quietly net-negative is bad design. Locking the family at first choice also
gives a run a clear identity. The alternative considered was keeping them additive and
merely *showing* the resulting split; exclusivity was chosen for stronger build identity.

**No two cards should quietly do the same job.** Veteran Topmen used to grant a 6% reload
bonus on top of Powder Monkeys' 13%, and its card text claimed 18% — wrong, and it blurred
both cards. Topmen now owns sail handling and crew recovery; Powder Monkeys owns reload.

**Four draft cards, not three.** With the ceiling far above the median, the difference
between runs was largely whether a useful card turned up early. More cards per hand cuts
variance without raising the power ceiling — the right shape of fix for a spread problem.

**Boss waves escalate with escorts, not more bosses.** Multiplying a fair fight does not
scale: a Brigantine stays dangerous however strong the player gets, so two of them was a
wall every measured run broke on. Wave two is now one Brigantine plus two Barques.

**Sustain is earned in play, not drafted.** The hull economy was break-even by
construction — 0.59 hull a minute in, 0.51 back — so one Carpenter stack, worth 0.36,
flipped the sign and became a prerequisite rather than an upgrade. The measurement that
settled it is a *pair*: the pilot drafting normally against the same pilot refusing repair
cards, 391s versus 324s. Raising the baseline instead was tried and rejected, because it
makes the card worthless rather than optional (446s with repair cards, 449s without).
**Any flat repair rate racing a flat damage rate is either mandatory or dead.** Recovery
now comes from timber salvaged off wrecks and from heaving to, both of which scale with
how the run is being played, and the cards multiply that instead of deciding it.

**A wreck leaves two kinds of flotsam, told apart by silhouette.** Coin is progress,
timber is survival; a round bright disc against a long pale baulk. One pickup that did
both made every wreck worth the same beat to windward — two make it a question, and since
both drift downwind the wind decides what each answer costs. Shape rather than colour
carries it, because the player is reading the water while being shot at.

**Furled is how you mend.** Repair runs six times faster with the canvas off her and the
guns are served at 60%. It is the only recovery mechanic that is a *decision*: you have to
make the sea room first, and you are stopped and visible while it happens. An earlier
version that simply gated repair on seconds-since-last-hit was measured and thrown away —
it collapsed runs from 391s to 310s, because in the back half you are never clear for
eight seconds, so it deleted sustain exactly when it was needed. The instinct was right;
it belongs in a thing you choose, not a condition you are passively judged against.

**~~Every captain starts with a free Ship's Carpenter.~~** *Reversed.* It was true that
sustain, not firepower, was what runs were short of — but a free stack of the same card in
every run is a head start nobody picked, and it spent one of the Carpenter's three stacks
before the first hand was dealt. A captain now puts to sea in a stock hull, so every point
of a build is chosen. Costs the test pilot about 18s of median survival (419 → 401s), which
is the price of the choice being real.

**Softening the spawn curve does not help on its own.** Fewer enemies means less plunder
and a slower draft, so both curves move together. The only reliable lever for the player
is levelling faster than the sea escalates.

*Refined later:* the two are more separable than that suggests. **Spawn gap governs
plunder income; enemy cap governs pressure.** Lowering the cap eases survival without
starving the draft, and proved the single most effective balance lever.

## Endless mode

**Completing the voyage offers a choice rather than ending the game.** Sail on and the
clock counts up instead of down, waves arrive every 55 seconds, and each is worse than
the last until something sinks you.

This keeps the timed run as a *beatable campaign* while giving skilled play somewhere to
go. It also means the voyage does not have to carry all the difficulty — which matters,
because the voyage has become considerably easier.

**Squadron sizes are capped** at four Brigantines and four Barques per wave. Past a point
more hulls stop adding difficulty and only add load; escalation continues through the
shrinking spawn gap and the heavier hull mix instead.

**Three pools, three ways to take a ship — not one health bar wearing three hats.** Hull
sinks her, rigging leaves her unable to run or fight, crew leaves her unable to resist
boarding; the last two end with her striking her colours when you come alongside. Both
come from the *Pirates!* manual rather than invention, which also supplies the economy: a
prize is worth far more than a wreck, and every ball you put into her lowers what she is
worth.

The alternative considered and rejected was collapsing to a **single health bar**. As the
game then stood that would have lost nothing — measured, the player never dropped below
69% rigging or 79% crew in 32 runs, because repair outran damage by nine times. But that
zero was a tuning accident, not a property of the idea. Rigging damage removing a ship's
ability to choose where she is, is the one thing tying gunnery back to the sailing model
the whole game is built on. The fix was to make the pools move, not to delete them.

**Rigging damage costs the helm as well as the legs — but gently.** It cost only speed
for a long time, which made chain shot's promise to *strand* a ship a half-truth, because
steerage saturates far below a crippled ship's speed. The faithful version, a dismasted
ship turning at a quarter, measured *worse for the build that uses it*: crippling an enemy
means she can no longer come to you, so she wallows out of your arc and has to be chased
down to be boarded. The approach requirement for capture and a hard helm penalty pull
against each other. Half authority at zero rigging is the version that makes the card
honest without taxing the player for believing it.

**A capture needs an approach, not a threshold.** A beaten ship strikes only when the
player closes to boarding range. Chain and grape *set up* the capture; they do not
perform it. Without the approach the last act of a fight is a damage number quietly
crossing a line, which is no act at all.

**Enemy hulls load different shot, and that is what made the pools matter.** Cutting the
player's repair rates was the obvious fix and the smaller half of it: with every ship
afloat firing round shot, nothing in the game could threaten your canvas whatever the
repair rate. A Frigate loading chain to keep you at arm's length and a Royal Sloop
loading grape to slow your reload took the worst rigging moment of a run from 0.84 to
0.42, and gave two hulls an encounter of their own.

*Still open:* **Double-Shotted measures level-for-level with taking no shot card**, even
after its hull bias went from ×1.7 to ×2.1. More damage per ball does not convert into
more kills, because the limit is how many hulls are in the arc rather than how fast each
dies. It wants a different idea, not a bigger number.

**Aim is wrong in three separate ways, and they are not interchangeable.** The fan is
deliberate — it is the wall of shot. Gun-laying error is the man on the moving deck. Lead
error is the gun captain misjudging the target's *speed*, and it is the only one that
genuinely rewards closing, because the same bad guess costs nothing at point-blank and a
hull's width at long range. When gunnery needed to be less accurate, most of the change
went into widening the fan rather than into random error: leaning on randomness would
have turned the broadside back into the shotgun blast the even spread was introduced to
avoid.

*Worth knowing before tuning this again:* at a normal fighting range the entire fan used
to land inside the target's hit radius, so every gun that bore was effectively a hit.
Adding modest per-gun error changed the hit rate by nothing at all — 53.1% before and
after. Error below the size of the target is not error.

**A broadside goes off together, but not to the instant.** Each gun draws its own small
*independent* delay inside `gunVolleyScatter` rather than queueing behind the one before
it. Two things follow. The volley lands as a single crash, so it is something the enemy
sees coming and sails out from under as a whole. And its length no longer grows with the
battery — under the old ripple, drafting gunports bought a broadside that took a quarter
of a second to leave the ship (0.186s at six guns, 0.247s at twelve, against 0.043s and
0.051s now). A shot-up crew is twice as ragged about it, which keeps crew damage audible
inside the volley rather than only in the reload timer.

**Upgrades are written in multipliers; the draft is read in knots.** "9% less drag" is
true and useless — nobody knows what drag is worth. The draft panel runs the same
arithmetic the physics runs, on a *copy* of the modifiers, and shows the ship's real
numbers before and after the card. That is only possible because `apply` was kept to a
pure edit of `ShipMods`: a preview is the same function run somewhere harmless.

**A ship is aground when the water is shallower than she draws.** Grounding used to be
measured against distance to a beach, which meant draught could only ever pay in the half
ship-length beside land — the one place every hull is in danger anyway. Keyed to depth
instead, it works anywhere there is a bottom, which is what lets a bar with no land in it
strand a Galleon while a Pinnace sails over the top. The gap between the lightest and
heaviest hull went from 2.3× to 4.5×.

**Reefs and bars carry nothing but draught.** No land, no cover from shot, no wind shadow
— they decide which hulls may pass and nothing else. Elongated rather than round, because
a circular hazard is a thing to steer round while a bar across your course is a question:
go about and lose the ground, or cross it and find out what you draw. How pale one is, is
how shallow it is, drawn from the same field function the physics reads — a hazard you
can only learn by hitting it is a trap rather than a tactic.

**Shoal width varies island to island.** A steep-to rock is a poor refuge; an island
standing in a mile of flats is a fortress a heavy hull cannot come at. Uniform shoals
made every island the same island, which is most of why draught never felt tactical even
though the numbers said it should.

**The run never begins in a lagoon.** Broad shoals and bars can enclose a pool of deep
water a given hull cannot leave. Fine as a hiding place you chose; unacceptable as the
one position the player never picked — so the spawn search counts how many courses run
clear to sea for the hull being sailed, not merely whether the water underneath is deep.

**The wind varies by place, not just over time.** A noise field veers and gusts it
locally and the pattern drifts downwind, so a favourable lane is worth seeking and a lull
is worth avoiding. Cat's paws on the water make it visible — without them, weather is
something that happens to the player rather than something they can read.

**Enemy hulls differ by behaviour, not only by statistics.** Skirmishers crowd you,
brawlers hold you abeam, standoff ships use their reach, and traders simply run. Numbers
alone produce the same encounter at different speeds.

**The enemy cap limits pressure, so traders are exempt from it.** A Fluyt is an
opportunity, not a threat; counting fleeing traders against the cap crowded out killable
targets and starved the run of progression.

**Playable hulls are a separate roster from the enemy ones.** The enemy Brigantine and
Galleon are tuned to be fought; reusing them would hand the player boss numbers. They
share names and silhouettes only.

**Hull size is evasion.** Hit radius scales with the ship, so small hulls are hard to hit
and large ones hard to miss. Without it, size was cosmetic and the Pinnace was simply
worse than everything rather than differently good.

## Land

**Terrain is generated from a hashed grid, not stored.** The arena is unbounded, so
islands must exist wherever the player sails. A hash per cell gives infinite,
deterministic coastline for no memory.

**One shoreline function, shared by physics and rendering.** A circle for collision and
a blob for the eye is a bug waiting to happen.

**Draught makes land a weapon.** How deep a hull draws sets where she grounds and how
shallows slow her, so a Brigantine is near-anchored in water a Pinnace crosses at speed.
Because enemy avoidance also scales with draught, heavy hulls will not follow you in —
making the shoals an escape valve rather than a place to farm bosses.

**Land blocks shot and line of sight.** This is what turns an island from an obstacle
into a tactic.

**Enemy navigation is steering behaviour, not pathfinding.** Captains graze past
obstacles along the tangent. A navigation mesh over infinite procedural terrain would
cost far more than it returns for enemies on screen for half a minute. Measured at 0.00%
of AI time aground.

## Still open

- **One continuous space, or an overworld plus a battle screen?** Pirates! separates them;
  Vampire Survivors is a single arena. Current lean is one continuous space, because modal
  transitions would kill swarm pressure. Not yet blocking anything — but
  [plans/scenario.md](plans/scenario.md) and
  [plans/progression-meta.md](plans/progression-meta.md) both press on it.
- **Turn-rate upgrades stack multiplicatively with no cap**, and enough of them will let
  the ship pivot on the spot. Wants diminishing returns.
- **The voyage may now be too easy**, at a 50% win rate for a crude scripted pilot, up
  from 10%. Endless mode absorbs some of this concern, but the voyage itself may want
  re-hardening. See [plans/balance.md](plans/balance.md).

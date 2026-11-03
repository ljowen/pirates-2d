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

**Every captain starts with a free Ship's Carpenter.** Sustain, not firepower, was what
runs were short of.

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

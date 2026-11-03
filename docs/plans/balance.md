# Plan: balance

**Status: resolved, and possibly overshot.** A human completes runs comfortably, and the
scripted pilot now wins **50% of 16 seeds** — up from 10% before shot types were made
exclusive. The voyage may have become too easy.

The counter-argument is that endless mode now carries the challenge: the voyage is a
campaign you can beat, and sailing on is where difficulty lives. Whether to re-harden the
voyage is a design call, not a bug. If you do, the levers in order of bluntness are the
final boss wave composition, `enemyCapEnd`, and `runDuration`.

What remains is refinement rather than a blocked curve. The history below is kept because
the findings generalise, and because any future content will need re-tuning against them.

## The problem (as it was)

Measured with a scripted pilot across 8 seeds, auto-drafting by a fixed priority list:

| | |
|---|---|
| Median survival | **310s of 480s** (65%) |
| Spread | 184–459s |
| Best runs | 91% and 96% |
| Win rate | **0%** |

The median is stubborn, but the ceiling has moved a long way: good runs now finish within
a minute of the clock. That pattern — ceiling rising while median holds — suggests the
remaining gap is **variance in how well a build comes together**, not a flat wall.

## What has already been tried

| Change | Effect on median | Effect on ceiling |
|---|---|---|
| Starting Carpenter (free stack) | 303 → 315s | — |
| Escorts instead of 2 Brigantines at 60% | 315 → 318s | 328 → 415s |
| Enemy cap 9 → 6 | 318 → 310s | 415 → **459s** |

The enemy cap was the most effective single lever. It also produced the most useful
refinement to the "coupled curves" finding below: **spawn gap governs plunder income,
enemy cap governs pressure.** They are separable after all, as long as the player kills
fast enough to stay under the cap.

## What has already been ruled out

Worth knowing so these are not re-tried:

**It is not bot skill.** Adding sail management (crack on to close, shorten sail to
fight) and disengage-to-repair behaviour to the test pilot changed nothing. The gap is in
the balance, not the pilot.

**It is not raw damage output.** The engagement-rate finding from Phase 2 — only 19% of a
duel spent within gun range — redirected an entire pass away from damage numbers. Gunnery
has since been widened (range 420→500, arc 50°→62°, reload 2.4s→2.0s) and that *did* help
pacing substantially.

**Softening the spawn curve does not work on its own.** Fewer enemies means less plunder
and a slower draft, so both curves move together. This is the single most important thing
to understand before touching the director: **the levers are coupled.**

## Leading hypotheses

In rough order of confidence.

### 0. Build variance — the newest evidence

With the ceiling at 96% and the median at 65%, the difference between runs is large. The
test pilot drafts by a fixed priority list, so a run that is offered good cards early
pulls far ahead of one that is not.

**Try:** widening the draft to four cards, or allowing one reroll per level. Both reduce
variance without raising the power ceiling, which is exactly the shape of fix this
pattern calls for.

### 1. The upgrade curve is too flat for the run length

The player reaches roughly level 8–12 in 480 seconds, i.e. 7–11 upgrades. Vampire
Survivors-likes typically hand out far more than that over a run, and the power fantasy
depends on it. Fifteen cards with ~55 total stacks available means there is headroom to
level much faster without running dry.

**Try:** halve `plunderForLevel` again, or raise plunder values per hull. Watch whether
the back half starts to feel powerful rather than merely survivable.

### 2. The run is simply too long for the current content depth

480 seconds against fifteen upgrade cards may just be more than the content supports.

**Try:** `runDuration` to 300–360s and see whether the curve resolves cleanly. A shorter
run that works is far more useful than a longer one that does not, and the length can grow
as content does. Note that boss waves are expressed as *fractions* of run length, so they
rescale automatically — but they also arrive sooner in absolute time, which is what made
an earlier shortening backfire.

### 3. Attrition outpaces repair in the back half

Baseline repair is 0.0085 hull/s and 0.02 rigging/s. Over the last two minutes, with 6–9
enemies afloat, that may be nowhere near enough.

**Try:** raising the baseline, or adding repair pickups that drop occasionally from
wrecks. The latter is more interesting — it gives the player a reason to chase a specific
prize, and interacts with the wind the same way plunder does.

### 4. The final boss wave is unreasonable

Three Brigantines at 88%, when one is a knife-edge fight against a stock ship. Even with
upgrades this may be a wall rather than a climax.

**Try:** watching whether anyone ever reaches it. If the run never gets that far, this is
moot; if it does, consider two Brigantines plus escorts rather than three.

## Levers

All under **THE RUN** and **GUNNERY** in the tuning panel.

| Lever | Current | Effect |
|---|---|---|
| `runDuration` | 480s | Rescales the whole curve including boss timings |
| `spawnIntervalStart/End` | 7.0 / 2.6s | Plunder income, *and* some pressure |
| `enemyCapStart/End` | 2 / 6 | **Pressure. The main survivability dial** |
| `bossLull` | 22s | How long routine spawns pause when a boss lands |
| `playerHullRepair` | 0.0085/s | Sustain |
| `playerSailRepair` | 0.02/s | Sustain, and whether escape stays possible |
| `plunderForLevel` (code) | `2 + (N−1) × 0.9` | The power curve |

Hull mix thresholds live in `sim/director.ts`; boss timings in `BOSS_WAVES`.

## Method

Play it. The harness in [../TUNING.md](../TUNING.md) is good for *comparative* questions
("did this change help?") and poor for *qualitative* ones ("does the back half feel
desperate or tedious?"). Both matter and the second cannot be automated.

When a change seems to help, confirm with 8 seeds through the scripted pilot before
believing it — several apparent improvements turned out to be seed noise.

## Related risk

**Turn-rate upgrades stack multiplicatively with no cap.** Rakish Lines at 5 stacks is
×1.76, and combined with battle sails the turning circle approaches a ship length. Enough
and the ship pivots on the spot, which breaks the fantasy. Wants diminishing returns or a
hard ceiling — worth fixing while balance is already open.

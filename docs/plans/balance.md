# Plan: balance

**Status: resolved. The curve holds.** The history below is kept because the findings
generalise, and because any future content will need re-tuning against them.

## Current baseline

Re-measured after sustain, draught, aim and capture all shipped, on the suspicion that
the batch had quietly made the voyage easier. **It had not.** 32 seeds per hull, scripted
pilot, default tuning, confirmed byte-identical across three consecutive runs:

| Hull | Win | Median | Range | Level | Sunk | Taken | Plunder | Aground |
|---|---|---|---|---|---|---|---|---|
| Sloop | 44% | 447s | 302–480 | 8.53 | 29.31 | 0 | 45.0 | 5.1% |
| Pinnace | 19% | 433s | 200–480 | 8.69 | 22.34 | 0 | 47.5 | 3.9% |
| Brigantine | 38% | 448s | 183–480 | 8.25 | 27.72 | 0 | 42.9 | 8.9% |
| Fluyt | 28% | 453s | 182–480 | 8.03 | 16.56 | 0 | 38.9 | 7.2% |
| **All** | **32%** | **447s** | | | | | | |

The Sloop's 44% against the previously documented "50% of 16 seeds" is the same number at
a seed count that can support it. **Treat 32% across all hulls / 44% on the Sloop as the
figure to preserve**, and re-measure anything that touches damage, sustain or spawning.

### Two things the baseline exposed

**Capture is arithmetically unreachable without a shot doctrine — 0 prizes in 128 runs.**
Not noise, and not the pilot's draft priorities alone. Damage splits 62/24/14 across hull,
rigging and crew, all three pools divide by the same `hullStrength`, and enemies do not
repair at all. So a default build sinks a ship after `1/0.62` = **1.6 units of damage**
while needing `0.78/0.24` = **3.3** to drive her rigging below `strikeSails`. She goes
down at half the damage required to make her strike. Chain shot inverts exactly this —
`shotSails ×2.1, shotHull ×0.82` gives 1.78 to strike against 2.27 to sink — which is why
chain takes prizes and round shot never does. Capture being doctrine-gated is a defensible
design; **capture being invisible to every player who does not draft chain or grape is
probably not**, and it is worth knowing that is the current state.

**Heavy hulls spend ~9% of the run aground, and the reefs are not why.** With
`reefDensity = 0` the Brigantine measures 9.6% aground; with reefs on, 8.94%. It is the
island shoals, and it is the scripted pilot's land avoidance failing to respect its own
draught, not a terrain bug. Worth remembering before weather starts pushing ships to
leeward onto a lee shore.

Reefs do appear to do their job: turning them on moved the Sloop 31% → 44% and the Pinnace
9% → 19% while costing the deep-draught Fluyt 38% → 28%. At 32 seeds a 13-point swing is
roughly 1.5 standard errors, so read that as consistent-with-intent rather than proven.

### After squalls

Weather shipped on top of the baseline above. The aggregate barely moved — **32% → 28%,
median 447s → 440s** — but the hull spread narrowed from 25 points to 15:

| Hull | Before weather | With squalls |
|---|---|---|
| Sloop | 44% | 34% |
| Pinnace | 19% | 34% |
| Brigantine | 38% | 19% |
| Fluyt | 28% | 25% |

Canvas blow-out was later made to actually bite (see
[SAILING.md](../SAILING.md#squalls)), which moved this to **26%** — Sloop 28%, Pinnace 28%,
Brigantine 16%, Fluyt 31%.

**Then sustain was cut back to heaving-to alone** — timber and baseline under-way repair
both removed, because the game played as though nothing was ever at stake. That is a much
larger change than anything above: **26% → 5% win, median 440s → 310s.**

Treat **5%** as the current floor rather than the current difficulty. The harness is
structurally bad at the only sustain route left (it is hove to for 3–7% of a run, where a
player picks the moment far better), so this figure understates the game by more than any
previous one. `heaveToRepair` is the dial: 6 → 10 roughly doubles the scripted win rate.

Earlier figure, kept for comparison: 26% across four hulls with timber and baseline repair. See
[SAILING.md](../SAILING.md#squalls) for which half of the mechanic does what — it is not
the half that was designed to.

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

480 seconds against fourteen upgrade cards may just be more than the content supports.

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

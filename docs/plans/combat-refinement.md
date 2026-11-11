# Plan: combat refinement

Deepening gunnery is the cheapest way to add draft content, because the systems already
exist — most of this is new numbers and new cards rather than new machinery.

**Do this after [balance](balance.md)**, so new cards are tuned against a curve that works.

## Why this is next after balance

The draft currently offers fourteen cards. By the back half of a run the pool is thin and
choices stop being interesting. Gunnery is the natural place to grow because:

- The `ShipMods` surface already carries `damage`, `reload`, `range`, `spread`,
  `extraGuns` and the three shot-split biases.
- Every new axis is immediately a draft card.
- It is the system the player interacts with most often.

## 1. Real range / damage / accuracy trade-offs

Right now these three are independent upgrade axes that all simply get better. Making
them trade against each other turns the draft from "take the biggest number" into a build
decision.

**Gun types as mutually-shaping choices:**

| Type | Range | Damage | Reload | Spread |
|---|---|---|---|---|
| **Long guns** | long | moderate | slow | tight |
| **Carronades** | short | heavy | fast | wide |
| **Swivels** | very short | light | very fast | wide, anti-crew |

Carronades are historically the right answer here — short-range smashers that were
devastating in a close action and useless at a distance. They pair naturally with battle
sails and a tight turning circle, giving a coherent "knife fighter" build against a
"stand off and pound them" build.

**Implementation:** these are `ShipMods` multipliers already. The work is card design and
making sure a build commits — probably by having carronade cards reduce `range` as well as
raising `damage`, so stacking them is directional.

## 2. Raking fire

A broadside into an enemy's bow or stern, where it travels the length of the ship.
Historically devastating and the single most tactical idea available here.

**Mechanic:** damage multiplier based on the angle between the shot and the target's
heading. Hitting within ~30° of their bow or stern axis does substantially more.

**Why it is good:** it rewards exactly the positioning the sailing model already teaches —
crossing someone's stern requires out-turning them, which requires managing canvas and
wind. It gives skilled play a damage ceiling that upgrades alone cannot reach.

**Implementation:** `stepProjectiles` already knows the victim; comparing the ball's
velocity against `ship.heading` is a few lines. Needs a clear visual and audio tell so the
player learns it — probably a distinct hit flash and a heavier sound.

## 3. Shot types with behaviour, not just bias

Currently shot types only reweight the damage split. Giving them distinct behaviour makes
them feel different rather than merely scoring differently.

| Shot | Current | Could also |
|---|---|---|
| **Chain** | ×2.1 rigging | Travel slower, shorter range — it tumbles |
| **Grape** | ×2.4 crew | Fire many more, much weaker projectiles in a cone |
| **Double-shotted** | ×1.7 hull | Longer reload — you are loading twice the powder |

Grape as a cone of many small projectiles is the most visually distinct and would read
instantly.

## 4. Crew as a real resource

Crew currently only slows reload and sail handling. It could carry more weight:

- **Crew determines how many guns you can work.** Heavy crew losses take batteries
  offline entirely, which makes grape shot genuinely threatening rather than a soft debuff.
- **Crew recovers slowly, or not at all within a run.** Makes a bloody fight have
  consequences beyond the immediate.

This also gives grape shot a clear role in the enemy's hands — a reason to fear Barques
specifically, if they were given grape.

## 5. Boarding

The biggest *Pirates!* signature still missing, and deliberately deferred — in the
original it is a full sword-fighting minigame, which is out of scope for a swarm game.

**A swarm-appropriate version:** when an enemy is sufficiently crippled (rigging near
zero, crew low), closing to touching range captures her instead of sinking her. The prize
gives a large plunder bonus, or restores crew, or temporarily fights alongside you.

**Why it fits:** it rewards chain and grape builds specifically — shoot out their rigging
and gut their crew, then close. That gives the non-hull shot types a win condition of
their own rather than being slower routes to the same sinking.

**Why it is risky:** closing to touching range in a swarm is suicidal unless the reward is
large, and the manoeuvring required may be too fiddly under pressure. Prototype before
committing.

## 6. Enemy variety through behaviour

New hulls are cheap; new *behaviours* are what actually change how a fight plays.

- **A hull that keeps its distance** and relies on long guns, forcing you to close.
- **A hull that rushes** and tries to foul you, punishing a slow turner.
- **A hull that flees when hurt**, making chain shot matter — and giving the wind a job,
  since a fleeing ship runs downwind.

The AI already has the structure for this: `desiredHeading` is the only method that needs
to vary.

## Sequencing

1. Raking fire — highest skill-expression return for the least work
2. Carronades vs long guns — the first real build divergence
3. Shot behaviour (grape as a cone especially)
4. Enemy behaviour variety
5. Crew consequences
6. Boarding — prototype only, do not commit early

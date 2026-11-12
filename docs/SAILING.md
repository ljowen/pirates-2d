# The sailing model

This is the foundation everything else sits on. It was built and tuned first, on the
principle that if the sailing does not feel good nothing built on top of it will.

Every constant below lives in `sim/tuning.ts` and is editable live — see
[TUNING.md](TUNING.md).

## The polar curve

Boat speed as a fraction of best speed, given the angle between your heading and the eye
of the wind. This single curve carries most of the feel, so it is a draggable table
(`sim/polar.ts`) rather than a formula.

**The curve means what it says.** A point drawn at 0.3 really does produce 30% of best
speed. That requires squaring the multiplier on the way into the thrust calculation,
because drag here is dominated by its quadratic term, where speed goes as the square root
of thrust. Without that correction a multiplier of 0.2 produced 40% of top speed and the
tuning panel was lying to whoever used it.

Measured at wind strength 1.0, full sails:

| Angle off wind | Speed | % of best | Curve says |
|---|---|---|---|
| 0° (head to wind) | −16 | — | drifts astern |
| 30° | 0 | 0% | 20% |
| 45° (close hauled) | 59 | 27% | 33% |
| 60° | 122 | 56% | 58% |
| 90° (beam reach) | 209 | 96% | 96% |
| 105° (best) | 218 | 100% | 100% |
| 180° (running) | 167 | 76% | 76% |

Above 50° the curve tracks reality within a few points. Below that, leeway eats into your
progress — which is the point. **That gap is the cost of sailing upwind.**

## Tacking

Best upwind VMG — actual ground made toward the wind — peaks at **60° off the wind**, not
at the closest angle you can point:

| Angle off wind | VMG to windward |
|---|---|
| 40° (pinching) | 34 |
| 45° | 41 |
| 50° | 52 |
| **60°** | **61** |
| 75° | 46 |

So over-pointing actively punishes you, and there is a real optimum to discover. This is
the skill ceiling of the sailing layer, and the enemy AI is subject to exactly the same
trap — see [COMBAT.md](COMBAT.md).

A tack costs roughly **half your speed over about 4 seconds**. Expensive, never fatal.

## Leeway and getting stuck

Leeway is the wind shoving hull and rig bodily downwind. Three details keep it honest:

**It scales with how badly the rig is drawing** (`1 - polarMult`). A sail converting wind
into forward drive is not simultaneously being shoved sideways by it. So sailing well is
self-stabilising and stalling compounds.

**It is mostly lateral.** The rig's useful forward drive is already accounted for by the
polar curve, so what is left over is mostly sideways slip — only 20% acts fore-and-aft
(`leewayAxial`). Without this split, leeway fought the polar curve directly and made
close-hauled sailing impossible.

**Sternway is punished.** A hull moving transom-first is not streamlined, so going
backwards carries ~6× the drag (`sternwayDrag`). Head to wind you make sternway at about
16 units — a slow, helpless drift, not a rocket. Before this, leeway blew a stalled ship
astern at 40% of top speed.

Together these mean being caught in irons is frightening but always recoverable: you
drift slowly backwards, the rudder still has a little authority (`steerageFloor`), and
bearing away fills the sails again.

## The sail plan

Discrete states, Up/Down stepping between them rather than ramping a continuous
throttle. The crew takes a couple of seconds to work the canvas.

They are a **sail plan**, set from the deck upward the way a square rigger actually makes
sail, and each order is one more yard crossed on the mast (fore-and-aft rigs map the same
orders onto a reefed main, the full main and jib, then the gaff topsail and flying jib —
see *Every class has her own rig* below):

| Order | Canvas | Yards a mast |
|---|---|---|
| Furled | 0.00 | 0 — bare poles |
| Courses | 0.32 | 1 |
| Topsails | 0.55 | 2 |
| Royals | 1.00 | 3 |

**The ship shows which.** The sprite carries one sail per yard, each higher one narrower
and stepped a little toward the bow — from directly overhead a course and a topsail sit
at the same plan position and would draw exactly on top of each other, so the stack is
on the same yard line. They are painted lowest first, so each smaller sail sits over the
larger one below it with the course's belly showing round it, as it is seen from aloft —
for a long time they were painted the other way round and the course hid everything
above it, and then for a while each upper yard was stepped toward the bow as false
perspective, which once braced round put it out on the course's belly instead of on its
yard. The HUD draws the mast
itself: a filled yard is carrying canvas, an outlined one has been ordered and the hands
are still getting it on her. Yards are derived from the canvas actually aloft rather than
from the order, so sail appears one yard at a time as the crew works.

This replaced a three-position throttle whose middle setting had to be explained. It also
fixed something the [sprite sheet](../README.md) made obvious: with one sail per mast,
**eleven hulls shared one silhouette**, separated only by scale and tint.

**Balance did not move, by construction.** Topsails is the old Battle Sails at exactly
0.55 and Royals the old Full Sails at exactly 1.00, so every figure measured to date
still holds — confirmed at 7% win, 6.84 average level and 31.1 plunder across four hulls
and 128 runs, identical to three decimal places before and after. Courses is a genuinely
new option rather than a re-cut of the old ones. The AI and the test pilot address orders
by name (`SAIL_FIGHTING`, `SAIL_FULL`) rather than by index, which is what made adding a
state a safe change instead of a hunt for every bare 1 and 2.

Less canvas means a slower ship but a **much tighter turning circle** — 83 vs 186 units
of radius, roughly 1.4 ship lengths against 3.2. Topsails barely help you tack
(3.4s vs 4.0s); they earn their place in a knife fight, where staying inside an enemy's
guns matters more than speed.

Full sail in heavy air costs you speed rather than gaining it (`overcanvasPenalty`).

### Furled is not just "stopped" — it is the *only* way to mend

Take the canvas off her and the hands come off the yards and go to the pumps. **Under way
she mends nothing at all**, and neither does she under Courses: `mending` is
`heaveToRepair` (×6) once she is fully furled and nothing otherwise, and the guns are
served at 60% of their usual rate while it happens.

It did not start that way. There was a baseline repair rate under way, and wrecks shed
timber that mended the hull on top of it. Both worked, and both were removed, because
together they healed faster than the sea could hurt: **whole runs went by without the
player ever feeling in danger until a Galleon arrived.** Attrition that quietly reverses
itself while you do what you were going to do anyway is not attrition.

So recovery is now the same kind of decision as everything else here, and it is the only
one of its kind: you have to make the sea room first, and then spend the time. The cost is
honest — you are stopped, visible, slow to answer the helm and slow to answer a broadside
— so heaving to inside somebody's gun range is simply dying more comfortably.

`hoveTo` is all or nothing. It used to ramp up from Topsails, so a ship under Courses —
still making way, still able to run — mended at about 40% of the full rate, and reefing
became a cheap half-measure that blurred the one decision the mechanic exists to ask. Now
the order has to be Furled *and* the canvas actually in (under 2% aloft). The crew's time
on the yards is therefore still part of the price, in both directions: she does not begin
mending the instant you give the order, and she does not get under way the instant you
want to run.

A Sloop mends her hull from nothing in **20 seconds hove to, and never under way**. With
three stacks of Ship's Carpenter that falls to 6 — the card's job is not whether you
recover but **how long you are a sitting target while you do**.

**This is the hardest thing in the game to measure**, and it now carries all of sustain.
See [TUNING.md](TUNING.md) — the scripted pilot heaves to for 3–7% of a run and a human
does it far better, so every win-rate figure taken after this change is a floor well below
what the mechanic is actually worth.

## Steering

```
turnRate = baseTurnRate × class × mods × rudder × steerage × canvasPenalty
```

- **Rudder inertia.** The helm eases toward your input over ~0.3s rather than snapping.
- **Steerage.** A rudder only bites when water flows past it. Authority rises from
  `steerageFloor` (0.12) at rest to full at `steerageRefSpeed` (70 units/s).
- **Canvas penalty.** More sail aloft means a wider, more sluggish turn.

Turning scrubs speed as an *emergent* consequence rather than an explicit rule: the
velocity vector lags the new heading, creating lateral velocity, which the keel then
kills. That also means the ship carries momentum through a turn and feels heavy.

### Turn rate and upgrades

| Base turn rate | Tack (full) | Tack (battle) | Circle (full) | Circle (battle) |
|---|---|---|---|---|
| 0.80 rad/s | 4.7s | 4.0s | 229 | 113 |
| **0.95 rad/s (current)** | **4.0s** | **3.4s** | **186** | **83** |
| 0.95 with a +25% upgrade | 3.3s | 2.8s | 126 | 64 |

Battle sails gain disproportionately from turn-rate upgrades (−27% radius vs −19% for
full sails) because lower speed compounds with higher turn rate. Pleasant synergy — a
turn-rate build naturally becomes a close-quarters build.

> **Open risk.** Turn-rate upgrades stack multiplicatively with no cap. Enough of them
> and the ship pivots on the spot, which breaks the fantasy. Wants diminishing returns or
> a hard ceiling. See [plans/balance.md](plans/balance.md).

## Wind

A persistent, slowly wandering wind that varies **by place as well as by time**.

The ambient direction drifts around a mean heading and strength breathes in gusts. On
top of that, a 2D noise field veers and gusts the wind locally, and the whole pattern
travels downwind so a patch of calm drifts across the map rather than sitting over one
stretch of water forever.

| | Measured over a 24,000-unit square |
|---|---|
| Local veer from ambient | sd **17°**, 90% within ±29° (`windVeerDegrees` 55) |
| Local strength | sd 12%, 90% within 81–121% (`windLocalGust` 0.38) |
| Patch size | `windPatternScale`, 2200 units |
| Veer detail | `windVeerScale` 1.8 — direction varies on a shorter scale than strength |

So the best point of sail is never a fact you learn once. It changes as time passes, and
it changes as you sail — a favourable lane is something worth going to find, and a lull
is something worth seeing coming.

#### The veer was doubled, because the wind only appeared to change strength

`windVeerDegrees` was 26 and the field it scales is value-noise fbm, whose output sits
nowhere near its nominal range: the **measured** spread was only 8°. Sailing one
screen-width shifted the direction 8.4° while the strength moved 14.9% — and since points
of sail are ~25° wide, an 8° shift almost never changed the one the player could actually
read. The wind got stronger and weaker; it never veered.

At 55, with the veer sampled on its own shorter length scale so a header arrives before
the lull does, a screen-width shifts the direction **20.7°** — comparable to a band, so
the point of sail genuinely changes under you. Holding one heading across 10,000 units:

| | Angle off wind | Points of sail passed through |
|---|---|---|
| Before | 76–97° | Beam Reach → Close Reach → Beam Reach |
| After | **49–104°** | Beam → Close Reach → Beam → Broad Reach → Beam → Close Hauled → Close Reach |

The lesson generalises: **a noise field's tuning value is its ceiling, not its spread.**
Any number scaling fbm output wants measuring rather than reading.

### A run opens on a beam reach

The player used to start on a fixed easterly heading regardless of the wind. Measured
across 800 openings (four hulls, 200 seeds): **50.5% close reach, 39.0% close hauled, and
10.5% in irons** — never better than 79° off the wind.

One run in ten therefore began on *the one point of sail from which nothing the player
does works*. The first thing they learn is that the controls appear to be broken.

She is now laid on a beam reach taken from the wind **where she actually is**, since the
field veers by place and a heading computed from the mean would land in irons again on
exactly the seeds this is meant to fix. 800 openings: **100% beam reach, 81–99° off the
wind**, which is 0.96 of best speed on the polar. Both tacks are equally quick, so the one
with more water ahead of her bow wins.

The curve does not move — 5% win and a 310s median either way. This buys the first ten
seconds of a run, not the difficulty.

### Reading the water

Local wind would be invisible until you had already sailed into it, so the sea shows it:
**cat's paws**, the darker ruffled patches that mark stronger wind and the glassy ones
that mark a lull. Sampled on a coarse offset grid around the camera and drawn as
generously overlapping circles so they blend into a field rather than reading as blobs.

Without this the player can feel a lull but never anticipate one, which makes weather
something that happens *to* them rather than something to read and use.

### The lee of an island

Islands blanket the wind downwind of themselves — measured at **1.16 to windward against
0.76 in the lee**. Ducking behind an island shelters you from pursuit but also takes the
way off your own ship, which is the classic sailing problem and now a real decision here.

`Wind` itself stays pure and knows nothing of terrain; the coupling lives in
`World.windAt`, the layer that owns both. Everything with a position asks for the wind
*there* — hulls, plunder, the compass rose, the ambient audio — rather than reading a
global value.

Labels run from "Light airs" to "Hard gale" based on local strength.

### Squalls

A squall is a cell of hard wind that makes up to windward, crosses, and blows itself out
— `sim/weather.ts`. Inside one the wind runs to about **2.4x ambient** and bends by up to
20 degrees, which is enough to take a close-hauled ship aback.

The architecture made this nearly free. `Wind.at(x, y)` was already positional and already
the single place anything asks what the air is doing, so a squall is one more term in that
sample: no consumer changed, and the AI, the cat's paws, the compass rose and the audio all
picked the weather up without being told about it.

**Cells are generated upwind of the player, not scattered at random.** The sea is
unbounded, so a cell placed anywhere would almost never be met. More importantly a squall
has to arrive from somewhere you can watch it come from — the decision it asks for is only
a decision if the warning arrives in time to act on it.

#### Canvas splits — the cost that makes it a decision

`overcanvasPenalty` has existed since the first wind model and had **never once made
anyone shorten sail**, because it is only a speed penalty: on her best point of sail a
Sloop does 160 under battle sails in a steady breeze, and *even paying the penalty* she
does 274 under a full suit in a squall. Carrying on was strictly faster, so there was no
question to answer.

So carrying too much canvas in heavy air now splits it. The threshold is keyed to canvas
between battle sails and a full suit, which puts the decision exactly on the three-position
sail control the player already has:

| Under | In a squall |
|---|---|
| **Furled** | Safe. Also stopped. |
| **Battle sails** | Safe, and about as fast as a full suit in ordinary air |
| **Full sails** | ~20% faster again, and the rigging goes |

It took three goes to make that cost real, and all three failures are worth keeping.

**First: rigging mended itself as fast as it split.** A ship repairs her own rigging at
`playerSailRepair` = 0.0085/s. Blow-out in the thick of a squall took 0.0082/s. The two
cancelled to within 4% — the loudest warning in the game had a net effect of **zero**.
Hands are not bending on a new sail while the one aloft is blowing out of its bolt-ropes,
so self-repair now stops while `blowout` is non-trivial.

**Second: the trigger was keyed to absolute wind, which made it unreliable.** The ambient
wind wanders between 0.72 and 1.21, so the identical squall produced anything from full
force to nothing at all, and a *typical* core only ever reached **0.30** of the effect.
Blow-out is now driven by how deep in the cell you are — `WindSample.squall`, 0 outside and
1 in the thick of one — so the thick of any squall always splits a full suit. It also makes
the physics match the drawing, since cell intensity is what the shading is painted from: a
cell that looks faded now *is* faded.

**Third, and the real one: the rate was two orders of magnitude too small.** Even with both
fixes above, a six-second crossing under a full suit cost 2.7% of a suit. `blowoutRate` is
now 0.14/s and the tuner slider goes to 0.6 — the old range topped out at 0.06, which was
not enough to feel the mechanic even with the dial at maximum.

Measured in the running game, parked in the core of a cell:

| Under | Effect |
|---|---|
| **Full sails** | 100% → 65% rigging in **3.5 seconds** |
| **Battle sails** | `blowout` 0.00, rigging *recovering*, indefinitely |

The curve barely notices — 28% before, **26%** after — because the scripted pilot always
shortens sail, and so do the enemy captains. That is the right shape: this is a cost paid
only by a captain who chooses to carry on.

Enemy captains shorten sail by the same rule. Without that the weather would have mown the
fleet down, since enemies never repair, and a squall would have read as a free weapon
rather than as a hazard both sides have to sail through.

#### What it measured

32 seeds per hull, against the same seas with `squallInterval = 0`:

| Hull | Win (none -> squalls) | Level | Plunder | Hands (`crewSpeed`) |
|---|---|---|---|---|
| Sloop | 44% -> **34%** | 8.53 -> 9.81 | 45.0 -> 59.6 | 1.15 |
| Pinnace | 19% -> **34%** | 8.69 -> 9.50 | 47.5 -> 55.4 | 1.20 |
| Brigantine | 38% -> **19%** | 8.25 -> 7.25 | 42.9 -> 34.3 | 0.92 |
| Fluyt | 28% -> **25%** | 8.03 -> 7.19 | 38.9 -> 33.4 | 0.90 |
| **All** | **32% -> 28%** | | | |

The overall curve barely moves. **What moves is the spread between hulls, and it narrows
from 25 points to 15** — the Pinnace stops being the weak hull and the Brigantine stops
being a safe one.

#### Which half does which — and the explanation that was wrong

The obvious reading is that heavy hulls suffer because shortening sail takes time and how
much time is `cls.crewSpeed`, so a Brigantine is still getting her topsails in when the
squall is already on her. **That reading is wrong**, and running the weather with
`blowoutRate = 0` is what showed it:

| Hull | No weather | Squalls, no blow-out | Squalls as shipped | Wind | Canvas |
|---|---|---|---|---|---|
| Sloop | 44% | 41% | 34% | −3 | **−7** |
| Pinnace | 19% | 19% | 34% | 0 | **+15** |
| Brigantine | 38% | 22% | 19% | **−16** | −3 |
| Fluyt | 28% | 19% | 25% | **−9** | +6 |

The two halves do almost opposite jobs:

- **The wind itself is what punishes the heavy hulls.** The Brigantine loses 16 of her 19
  points before a single sail splits — see below for what actually causes that, because
  the obvious answer is wrong again.
- **Canvas splitting mostly helps the small hulls**, because it is not a cost paid only by
  the player. Enemy captains shorten sail by the same rule and **never repair**, so a
  squall leaves the fleet slower and worse-rigged — which is worth more to a Pinnace,
  whose entire plan is not being caught, than the rigging she loses herself.

So the cost deliberately designed *for the player* lands hardest on the fleet, and the
hazard that was not designed at all — more wind than a heavy ship can use — is what
actually re-ranks the hulls.

**Read the per-hull column with care.** Thirty-two seeds puts roughly 8 points of standard
error on a win rate, so only the Brigantine's −16 and the Pinnace's +15 are clearly
signal; the −3s and +6s are not worth defending.

#### What the weather actually punishes: the helm

The intuitive reading is that a slow hull gets *taken aback* by the wind shift. **She does
not.** The Brigantine's time in irons falls slightly under weather, 14.7% to 14.1%, and
her polar multiplier is flat at 0.669 against 0.671. She is not being stalled.

Giving her a faster helm and changing nothing else settles it:

| Her `turnRate` | No weather | Squalls | Weather is worth |
|---|---|---|---|
| **0.68** (stock) | 38% | 19% | **−19 points**, −1.00 levels, −20% plunder |
| 1.00 | 31% | 50% | **+19 points**, +0.31 levels, +5% plunder |
| 1.50 | 22% | 44% | **+22 points**, +0.40 levels, +9% plunder |

**The sign flips.** The same weather that costs the stock Brigantine 19 points of win rate
*gains* her 19 once she can turn like a Sloop. Nothing else about her changed — same
timbers, same broadside, same draught.

So a squall is a disturbance to your *position*, not to your speed: the wind shifts under
you by up to 20 degrees and everything on the board starts moving half again as fast.
Recovering a firing position after that is precisely what a slow helm cannot do. The
cross-hull numbers agree — the win-rate loss to the veer alone runs Pinnace (`turnRate`
1.5) 0, Sloop (1.0) −13, Fluyt (0.84) −9, Brigantine (0.68) −25. The Brigantine suffers
most because she has the slowest helm in the game *and* the deepest draught, so she cannot
duck into the shoals to buy the time back either.

Worth noting for its own sake: a handier Brigantine **wins less in calm weather** (38% at
0.68 against 22% at 1.5) while earning far more (8.25 levels and 42.9 plunder against
11.38 and 73.8). Turning well means engaging more, which means earning more and dying more
— the same engagement-throttle effect that makes sail state impossible to read cleanly in
[TUNING.md](TUNING.md).

#### How much weather there actually is

About **eight to nine squalls a run**, with the player inside one for **5–6% of the time**
and losing **4–7% of a suit of rigging** to blow-out over a whole run. That is far less
exposure than the numbers above might suggest, which is the point: a cell crossing the
view is a frequent sight, being caught in the middle of one is not, and the direct damage
is small next to what the wind does to where you can go.

(An earlier build at `squallRadius: 1150` put the player in a squall 19% of the time and
cost 18–20% of a suit. It also cost 10–13 points of win rate on every hull, with none of
the re-ranking — more weather simply made the game harder.)

## Presentation

The hull, rig and water are all procedural vector art on purpose: feel comes out of
motion long before it comes out of sprites, so none of this becomes art until the model
is locked. Three details are load-bearing rather than decorative.

**The yards brace round with the point of sail** — hard round when close hauled, square
across the hull when running — so the rig is itself a readout of your point of sail. Sails
that are not drawing shiver instead of holding a clean curve, and shot-away canvas
visibly shrinks.

**The compass rose paints the polar curve around its rim**, so you can see not just where
the wind is but where you *could* be going. The no-go zone is visible as a red arc you
cannot point into.

**The water is textured and scrolls.** Without a surface to move against, all sense of
speed disappears. Two tiling layers at different scales, creeping downwind.

Heel, wake and bow spray are all driven from speed and turn rate. None of them feed back
into physics.

## Every class has her own rig

Every ship used to be the same two-masted square rigger at a different size and colour,
which made a Pinnace and a Galleon one silhouette at two zooms. Each class now carries a
`look` in `sim/shipClasses.ts` — a hull plan and a list of masts — taken from what such
ships actually carried, because the real differences are also the legible ones:

| Class | Rig | Hull |
|---|---|---|
| Pinnace | One lateen (the player's adds a jib) | Small, fine |
| Sloop | One mast, gaff main and topsail, two jibs | Standard |
| Brigantine | Square fore, gaff main | Long, a few gunports |
| Royal Sloop | Brig: two square masts, spanker aft | Navy |
| Barque | Square fore and main, gaff mizzen | Bluff bow |
| Fluyt | Square fore and main, lateen mizzen | Pear-shaped: broad, bluff, pinched stern, poop |
| Frigate | Three square masts, spanker, two jibs | Long and fine, a row of ports |
| Galleon | Square fore and main, two lateen mizzens | Broad, castles fore and aft |
| Man-o'-War | Three tall square masts, spanker, two jibs | Biggest, two rows of ports, poop |

`solveRig` (`render/rig.ts`) solves every kind with the same terms — brace, belly, shiver
and shrink — and hands each style the same `SailDraw`, so a jib, a gaff main and a course
all go through one `drawSail`. A boom trims to leeward by how far off the wind she is,
nearly fore and aft close-hauled and squared out when running, so a fore-and-aft rig
reads its point of sail the way braced yards do. Yards brace no further than 45° — they
were allowed 66°, and near the wind that folded a three-master's canvas into one stack.

**Fore-and-aft canvas is painted under square canvas**, on every mast: jibs, gaff mains,
lateens and spankers are set low on stays and booms, and square sails are carried on yards
above them. A brigantine's gaff main used to be painted over her fore yards simply because
her mainmast came later in the list.

**Booms swing across; they do not jump.** Each ship view eases which side its booms and
headsails are on (`RigState.side`) over about three quarters of a second as she tacks or
gybes, and the canvas goes slack through the centreline and fills again on the new side.
The target only changes once the wind is clearly across, so running dead before it does
not flog the boom on every flicker of the wind.

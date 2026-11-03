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

## Sail states

Discrete, as in *Pirates! Gold* — Up/Down step between them rather than ramping a
continuous throttle. The crew takes a couple of seconds to work the canvas.

| State | Canvas |
|---|---|
| Furled | 0.00 |
| Battle Sails | 0.55 |
| Full Sails | 1.00 |

Less canvas means a slower ship but a **much tighter turning circle** — 83 vs 186 units
of radius, roughly 1.4 ship lengths against 3.2. Battle sails barely help you tack
(3.4s vs 4.0s); they earn their place in a knife fight, where staying inside an enemy's
guns matters more than speed.

Full sail in heavy air costs you speed rather than gaining it (`overcanvasPenalty`).

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

A persistent, slowly wandering wind rather than a fixed direction. Direction drifts
around a mean heading via seeded value noise; strength breathes in gusts. The best point
of sail is therefore never a fact you learn once — it is something you keep re-reading.

Labels run from "Light airs" to "Gale" based on strength.

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

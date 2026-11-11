import type { World } from '../sim/world'
import { SAIL_FURLED, SAIL_FIGHTING, SAIL_FULL } from '../sim/ship'
import { draughtDepth, landRadius } from '../sim/terrain'
import { angleDiff, clamp, wrapAngle } from '../core/math'
import { T } from '../sim/tuning'
import type { Upgrade } from '../sim/upgrades'
import { outmatches } from '../sim/stats'
import type { ShipClass } from '../sim/shipClasses'
import type { Voyage } from '../sim/voyage'

/**
 * A scripted captain, used to measure balance without a human at the helm.
 *
 * This lives in the repository rather than in a console snippet because every
 * balance figure in the docs came out of it: a pilot that drifts between
 * measurements makes the numbers incomparable. It is a *floor*, not a verdict
 * — it plays competently and unimaginatively, so clearing something here means
 * a player certainly can, while failing here is weaker evidence.
 */

/** Rough value ordering, standing in for a player building toward a plan. */
const DRAFT_PRIORITY: Record<string, number> = {
  'heavier-shot': 10, 'powder-monkeys': 10, 'extra-gunport': 9,
  'ships-carpenter': 8, 'sailmaker': 7, 'trained-gunners': 6, 'long-nines': 6,
  'rakish-lines': 5, 'round-shot': 5, 'taller-masts': 4,
  'veteran-topmen': 4, 'chain-shot': 3, 'grape-shot': 3, 'loot-hooks': 2,
  'carronades': 9, 'iron-knees': 9, 'letters-of-marque': 6, 'storm-canvas': 3,
  'prize-crews': 3, 'boarding-axes': 2,
}

export function pickCard(hand: Upgrade[]): Upgrade {
  return hand.slice().sort(
    (a, b) => (DRAFT_PRIORITY[b.id] ?? 1) - (DRAFT_PRIORITY[a.id] ?? 1),
  )[0]
}

/**
 * Decide a heading and sail state for this step, and write them to the world.
 *
 * Priorities, in order: do not pile onto a beach, break off downwind when
 * badly hurt, sweep up nearby plunder, otherwise hold the nearest enemy abeam
 * so the broadside bears. Never steers inside the no-go zone.
 */
/**
 * How the pilot handles weather. Exposed so an ablation can ask what reading
 * the sky is actually worth, without reaching in and overriding `sailOrder`
 * from outside — which also clobbers the sail decisions she makes for
 * fighting, and silently measures a different captain than the one intended.
 */
export type WeatherSense = 'reads' | 'reacts' | 'never'

export function autoPilot(world: World, weatherSense: WeatherSense = 'reads') {
  const p = world.player
  if (p.sunk) return

  let nearest = Infinity
  let target = null
  // A beaten ship is a prize worth more than a wreck, so close with her
  // rather than standing off and shooting. Without this the harness would
  // report capture as worthless simply because it never took one.
  let prize = null
  let prizeDist = Infinity
  // Traders are the richest hulls afloat and they are actively leaving.
  let runner = null
  let runnerDist = Infinity
  for (const e of world.enemies) {
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)
    if (d < nearest) { nearest = d; target = e }
    if (e.yielding && d < prizeDist) {
      prizeDist = d
      prize = e
    }
    if (e.cls.behaviour === 'trader' && d < runnerDist) {
      runnerDist = d
      runner = e
    }
  }

  let loot = null
  let lootDist = Infinity
  for (const g of world.plunder) {
    const d = Math.hypot(g.pos.x - p.pos.x, g.pos.y - p.pos.y)
    if (d < lootDist) { lootDist = d; loot = g }
  }

  const wind = world.windAt(p.pos)

  // Already stopped? Then hold on longer and accept a closer enemy, so the
  // decision has somewhere to settle. See the heave-to branch below.
  const mending = p.sailOrder === SAIL_FURLED
  const wantsToMend = T.heaveToRepair > 0 && p.hull < (mending ? 0.92 : 0.7)
  const roomToMend = nearest > (mending ? 430 : 620)

  // The Man-o'-War, while she is something to run from. Once the build has
  // outgrown her she is just the nearest enemy and the richest one.
  const hunter = world.hunter
  const hunterDist = hunter
    ? Math.hypot(hunter.pos.x - p.pos.x, hunter.pos.y - p.pos.y) : Infinity
  const hunted = hunter !== null && hunterDist < 1500 && outmatches(hunter, p)

  let want: number
  if (hunted && hunter) {
    // Run. Straight away from her under everything that will draw: she is
    // slower than any hull the player starts in, and a captain who knows only
    // that much survives her. The fifth time the same lesson has come round —
    // the proxy has to be able to do what the player can do, or it reports
    // the hunter as a death sentence when she is a sprint.
    //
    // Deliberately *not* toward the shoals, though that is the better play.
    // The pilot's shoal-seeking is an emergency measure that circles in the
    // ring, and tried here it put a Sloop on the bank under a ship of the
    // line's broadside in half its runs. Crossing a bar the hunter cannot is
    // a judgement about one's own draught that the harness does not have.
    want = Math.atan2(p.pos.y - hunter.pos.y, p.pos.x - hunter.pos.x)
    p.sailOrder = SAIL_FULL
  } else if (p.hull < 0.38 && target && drawsLessThan(p, target)) {
    // Hurt, and drawing less water than the ship chasing us: make for the
    // shallows, where she cannot follow. Without this the harness could not
    // play a shallow-draught hull's entire strategy, and reported the Pinnace
    // as unplayable when it had simply never tried the thing it is for.
    want = towardShallows(world) ?? wind.to
    p.sailOrder = SAIL_FULL
  } else if (wantsToMend && roomToMend) {
    // Hurt, with sea room: take the way off her and let the hands work.
    //
    // Thresholds are hysteretic — she breaks off at 0.70 hull and 620 of sea
    // room, but once stopped she will hold on until 0.92 and let an enemy come
    // to 430. Without the gap she flapped between making and shortening sail
    // every time a hull drifted across a single fixed range, and mended almost
    // nothing. Heaving to is the *only* sustain in the game now, so a proxy
    // that does it 3.6% of the time reports the economy as unsurvivable when
    // it is merely demanding.
    want = wind.to
    p.sailOrder = SAIL_FURLED
  } else if (p.hull < 0.55 && target && nearest < 900) {
    // Hurt and crowded, so there is no room to stop: run downwind and make
    // some. This is the half a player does without thinking and the pilot
    // never did — it waited for sea room to appear instead of going and
    // getting it, which with no passive repair means waiting to die.
    want = wind.to
    p.sailOrder = SAIL_FULL
  } else if (runner && runnerDist < 1300 && p.hull > 0.45) {
    // Run down a trader. The range has to be wide: she spawns at 1400 and is
    // already running, so a threshold that waits for her to come close waits
    // forever. Chasing from here is the decision a player actually makes.
    //
    // She is worth several warships and she is leaving, so
    // a pilot that only ever engages whatever is nearest never tests the one
    // thing chain shot is for — and reports it as a weak card. Same rule as
    // land avoidance and heaving to: the proxy has to be able to do what the
    // player can do, or it measures the absence of the skill as difficulty.
    const bearing = Math.atan2(runner.pos.y - p.pos.y, runner.pos.x - p.pos.x)
    // Close until the guns bear, then hold her off the beam and shoot.
    want = runnerDist > 300 ? bearing : bearing + Math.PI / 2
    p.sailOrder = SAIL_FULL
  } else if (prize && prizeDist < 900 && p.hull > 0.35) {
    // Lay her aboard. She cannot run and she cannot shoot back.
    want = Math.atan2(prize.pos.y - p.pos.y, prize.pos.x - p.pos.x)
    p.sailOrder = prizeDist > T.boardingRange * 1.5 ? SAIL_FULL : SAIL_FIGHTING
  } else if (loot && lootDist < 320) {
    want = Math.atan2(loot.pos.y - p.pos.y, loot.pos.x - p.pos.x)
    p.sailOrder = nearest > 520 ? SAIL_FULL : SAIL_FIGHTING
  } else if (target) {
    const bearing = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x)
    const port = bearing + Math.PI / 2
    const stbd = bearing - Math.PI / 2
    want = Math.abs(angleDiff(port, p.heading)) < Math.abs(angleDiff(stbd, p.heading))
      ? port : stbd
    p.sailOrder = nearest > 520 ? SAIL_FULL : SAIL_FIGHTING
  } else {
    want = p.heading
    p.sailOrder = SAIL_FULL
  }

  // Take in the topsails before it comes on to blow.
  //
  // A player watches a squall march across the water and shortens sail while
  // it is still a mile off; canvas takes several seconds to come down, so
  // reacting to the wind you are already in means splitting the rig during
  // the transition. Reading the cell is the whole skill the mechanic exists
  // to ask for, so the pilot is given the same sight — the fourth time this
  // exact lesson has come round, after land avoidance, heaving to and
  // chasing a trader.
  if (weatherSense !== 'never' && p.sailOrder > SAIL_FIGHTING) {
    const squall = world.wind.weather.nearest(p.pos.x, p.pos.y)
    const closing = weatherSense === 'reads' && squall !== null &&
      squall.power > 0.15 && squall.distance < T.squallSpeed * 6
    if (closing || wind.squall > T.blowoutAt) p.sailOrder = SAIL_FIGHTING
  }

  // Wind constraint first, then land — in that order. Clamping for the no-go
  // zone *after* avoiding a shore can throw the heading straight back into it,
  // which is exactly what the enemy captains get right and this did not.
  const off = angleDiff(want, wind.from)
  const noGo = (55 * Math.PI) / 180
  if (Math.abs(off) < noGo) want = wind.from + Math.sign(off || 1) * noGo

  want = avoidLand(world, want)

  world.steerInput = clamp(angleDiff(want, p.heading) * 1.8, -1, 1)
}

/**
 * Only worth running for the shallows against a *much* deeper pursuer. A
 * narrow advantage is not enough: at a 0.15 margin the Sloop started fleeing
 * from Barques, which is a worse play than running downwind and cost it every
 * win it had.
 */
function drawsLessThan(self: World['player'], other: World['player']): boolean {
  return self.cls.draught < other.cls.draught - 0.3
}

/**
 * A heading toward the shoal ring of the nearest island — shallow enough to
 * shake a deep pursuer, without piling onto the beach.
 */
function towardShallows(world: World): number | null {
  const p = world.player
  let best = null
  let bestDist = Infinity
  for (const island of world.terrain.near(p.pos, 1400)) {
    const d = Math.hypot(island.x - p.pos.x, island.y - p.pos.y)
    if (d < bestDist) { bestDist = d; best = island }
  }
  if (!best || bestDist > 1600) return null

  // Aim at the shoal ring rather than the island itself.
  const bearing = Math.atan2(best.y - p.pos.y, best.x - p.pos.x)
  const ring = (best.radius + best.shoalRadius) / 2
  if (bestDist < ring) return bearing + Math.PI / 2   // already there: circle in it
  return bearing
}

/**
 * Same tangent-grazing approach the enemy captains use. Without it the pilot
 * spent nearly a fifth of every run stuck on a beach, which made it measure
 * its own incompetence rather than the game's difficulty.
 */
function avoidLand(world: World, desired: number): number {
  const p = world.player
  const look = 340 * (0.8 + 0.7 * p.cls.draught)
  const margin = 40 + 70 * p.cls.draught
  // The water this hull actually needs. Without it the pilot sails over bars
  // it cannot cross and grounds on water the player can plainly see is pale —
  // reporting the hazard's existence as difficulty, exactly as it once did
  // with islands.
  const needs = draughtDepth(p.cls.draught) * 1.25

  // Already on the bank: steer straight for deep water and sort the rest out
  // afterwards. The island branch has always had this case — without it for
  // bars, a grounded hull sheers along the bar she is sitting on and stays
  // there with her sails still driving her into it.
  const here = world.terrain.probe(p.pos)
  if (here.depth < needs && here.escape && (!here.island || here.distance > margin)) {
    return Math.atan2(here.escape.y, here.escape.x)
  }

  let island = null
  let shoal: { escape: { x: number; y: number } } | null = null
  for (const t of [0.35, 0.7, 1]) {
    const probe = world.terrain.probe({
      x: p.pos.x + Math.cos(desired) * look * t,
      y: p.pos.y + Math.sin(desired) * look * t,
    })
    if (probe.island && probe.distance <= margin) { island = probe.island; break }
    if (probe.depth < needs && probe.escape) { shoal = { escape: probe.escape }; break }
  }
  if (!island && shoal) {
    // Sheer across the bar by the shortest way off, as the enemy captains do.
    const away = Math.atan2(shoal.escape.y, shoal.escape.x)
    const side = angleDiff(desired, away) >= 0 ? 1 : -1
    return wrapAngle(away + side * (Math.PI / 3))
  }
  if (!island) return desired

  const dx = island.x - p.pos.x
  const dy = island.y - p.pos.y
  const range = Math.hypot(dx, dy) || 1
  const toIsland = Math.atan2(dy, dx)
  const edge = landRadius(island, Math.atan2(-dy, -dx))

  if (range < edge + margin * 0.5) return wrapAngle(toIsland + Math.PI)

  const half = Math.asin(Math.min(1, (edge + margin) / range))
  const a = wrapAngle(toIsland + half)
  const b = wrapAngle(toIsland - half)
  return Math.abs(angleDiff(a, desired)) < Math.abs(angleDiff(b, desired)) ? a : b
}

export interface RunResult {
  seed: number
  won: boolean
  seconds: number
  level: number
  shipsSunk: number
  /** Prizes taken whole rather than sunk. Worth more; costs you the closing. */
  shipsTaken: number
  plunder: number
  /** Share of the run spent with the keel on the bottom. Should be near zero. */
  agroundPercent: number
  /** Times the Man-o'-War was outlasted, and times she was beaten. */
  huntersSlipped: number
  huntersBeaten: number
}

/** Play one run start to finish with no renderer attached. */
export function simulateRun(
  world: World, seed: number, maxSeconds = 500, weatherSense: WeatherSense = 'reads',
  cls?: ShipClass, voyage?: Voyage,
): RunResult {
  world.reset(seed, cls, voyage)
  world.player.sailOrder = SAIL_FIGHTING
  const dt = 1 / 60
  let steps = 0
  let aground = 0

  for (let i = 0; i < maxSeconds * 60; i++) {
    if (world.run.state === 'drafting' && world.run.draft) {
      world.run.choose(pickCard(world.run.draft), world.player)
      continue
    }
    if (world.run.state !== 'sailing') break
    world.drainSunk()
    autoPilot(world, weatherSense)
    world.step(dt)
    steps++
    if (world.player.aground) aground++
  }

  return {
    seed,
    won: world.run.state === 'won',
    seconds: Math.round(world.run.elapsed),
    level: world.run.level,
    shipsSunk: world.run.shipsSunk,
    shipsTaken: world.run.shipsTaken,
    plunder: +world.run.totalPlunder.toFixed(1),
    agroundPercent: +(100 * aground / Math.max(1, steps)).toFixed(2),
    huntersSlipped: world.run.huntersSlipped,
    huntersBeaten: world.run.huntersBeaten,
  }
}

/** Run a batch and summarise. The standard way to compare a tuning change. */
export function benchmark(
  world: World, seeds = 16, maxSeconds = 500, weatherSense: WeatherSense = 'reads',
) {
  const runs = Array.from(
    { length: seeds }, (_, i) => simulateRun(world, i + 1, maxSeconds, weatherSense),
  )
  const times = runs.map((r) => r.seconds).sort((a, b) => a - b)
  const mean = (pick: (r: RunResult) => number) =>
    +(runs.reduce((sum, r) => sum + pick(r), 0) / runs.length).toFixed(2)
  return {
    seeds,
    winRate: `${Math.round((100 * runs.filter((r) => r.won).length) / runs.length)}%`,
    medianSeconds: times[Math.floor(times.length / 2)],
    range: `${times[0]}–${times[times.length - 1]}`,
    avgLevel: mean((r) => r.level),
    avgSunk: mean((r) => r.shipsSunk),
    avgTaken: mean((r) => r.shipsTaken),
    avgPlunder: mean((r) => r.plunder),
    avgAgroundPercent: mean((r) => r.agroundPercent),
    runs,
  }
}

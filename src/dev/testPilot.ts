import type { World } from '../sim/world'
import { landRadius } from '../sim/terrain'
import { angleDiff, clamp, wrapAngle } from '../core/math'
import type { Upgrade } from '../sim/upgrades'

/**
 * A scripted captain, used to measure balance without a human at the helm.
 *
 * This lives in the repository rather than in a console snippet because every
 * balance figure in the docs came out of it: a pilot that drifts between
 * measurements makes the numbers incomparable. It is a *floor*, not a verdict
 * — it plays competently and unimaginatively, so clearing something here means
 * a player certainly can, while failing here is weaker evidence.
 */

/**
 * How much each archetype wants a card with a given tag.
 *
 * Once upgrades carry costs, a flat priority list becomes an actively bad
 * drafter — it happily takes heavy guns onto a ship built for speed and then
 * reports the whole system as broken. The pilot has to commit to a direction,
 * the way a player would.
 */
type Archetype = 'gunline' | 'corsair' | 'ironside' | 'magpie'

const AFFINITY: Record<Archetype, Record<string, number>> = {
  // Every plan wants guns, because killing is the only source of progression
  // and a build that cannot clear the sea drowns in it. The archetypes differ on
  // *which* guns and what else they carry, not on whether to arm at all —
  // weighting them otherwise produced builds measurably worse than taking no
  // upgrades whatsoever.
  gunline: { guns: 3, close: 1.2, heavy: 0.8, tough: 1.4, reach: 0.4, handling: 0.4, speed: 0.2, light: 0.4, economy: 0.6 },
  corsair: { guns: 2.8, close: 1.5, light: 1.4, speed: 1.3, handling: 1.3, tough: 0.4, reach: 0.2, heavy: -0.3, economy: 0.8 },
  ironside: { guns: 2.5, tough: 2.8, heavy: 1.0, close: 0.9, reach: 0.3, handling: 0.3, light: -1.0, economy: 0.4 },
  magpie: { guns: 2.3, economy: 2.4, close: 1.0, tough: 1.2, speed: 1.0, handling: 0.9, heavy: -0.2, light: 0.5 },
}

/** The plan this hull naturally suits. */
function archetypeFor(hullId: string): Archetype {
  if (hullId.includes('pinnace')) return 'corsair'
  if (hullId.includes('brigantine')) return 'ironside'
  if (hullId.includes('fluyt')) return 'magpie'
  return 'gunline'
}

function scoreCard(card: Upgrade, plan: Archetype): number {
  const affinity = AFFINITY[plan]
  let score = 0.4
  for (const tag of card.tags ?? []) score += affinity[tag] ?? 0
  return score
}

/**
 * Choose from a hand, or refuse it. Returns null when nothing on offer helps
 * the plan — refusing banks part of the level back and brings the next hand
 * round sooner, which beats taking a card that works against the build.
 */
export function pickCard(hand: Upgrade[], hullId: string): Upgrade | null {
  const plan = archetypeFor(hullId)
  const best = hand
    .map((card) => ({ card, score: scoreCard(card, plan) }))
    .sort((a, b) => b.score - a.score)[0]
  return best && best.score > 0.5 ? best.card : null
}

/**
 * Decide a heading and sail state for this step, and write them to the world.
 *
 * Priorities, in order: do not pile onto a beach, break off downwind when
 * badly hurt, sweep up nearby plunder, otherwise hold the nearest enemy abeam
 * so the broadside bears. Never steers inside the no-go zone.
 */
export function autoPilot(world: World) {
  const p = world.player
  if (p.sunk) return

  let nearest = Infinity
  let target = null
  for (const e of world.enemies) {
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)
    if (d < nearest) { nearest = d; target = e }
  }

  let loot = null
  let lootDist = Infinity
  for (const g of world.plunder) {
    const d = Math.hypot(g.pos.x - p.pos.x, g.pos.y - p.pos.y)
    if (d < lootDist) { lootDist = d; loot = g }
  }

  const wind = world.windAt(p.pos)

  // Making port is worth a detour, but only for a refit worth having. At a
  // low threshold the pilot shuttled to a yard every forty seconds and spent
  // the voyage sailing rather than fighting, which earned it neither coin nor
  // kills. Go in with a purse, or go in to be mended.
  const needsMending = p.hull < 0.45 && world.run.coins >= world.run.repairPrice(p)
  const worthRefitting = world.run.coins >= 120
  const yard = (worthRefitting || needsMending) ? world.nearestYard : null
  const makingPort = yard !== null && yard.distance < 2600 && p.hull > 0.15

  let want: number
  if (p.hull < 0.38 && target && drawsLessThan(p, target)) {
    // Hurt, and drawing less water than the ship chasing us: make for the
    // shallows, where she cannot follow. Without this the harness could not
    // play a shallow-draught hull's entire strategy, and reported the Pinnace
    // as unplayable when it had simply never tried the thing it is for.
    want = towardShallows(world) ?? wind.to
    p.sailOrder = 2
  } else if (p.hull < 0.35 && target) {
    // Badly hurt with nowhere shallow to go: run downwind instead.
    want = wind.to
    p.sailOrder = 2
  } else if (makingPort && yard) {
    want = Math.atan2(yard.pos.y - p.pos.y, yard.pos.x - p.pos.x)
    p.sailOrder = 2
  } else if (loot && lootDist < 320) {
    want = Math.atan2(loot.pos.y - p.pos.y, loot.pos.x - p.pos.x)
    p.sailOrder = nearest > 520 ? 2 : 1
  } else if (target) {
    const bearing = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x)
    const port = bearing + Math.PI / 2
    const stbd = bearing - Math.PI / 2
    want = Math.abs(angleDiff(port, p.heading)) < Math.abs(angleDiff(stbd, p.heading))
      ? port : stbd
    p.sailOrder = nearest > 520 ? 2 : 1
  } else {
    want = p.heading
    p.sailOrder = 2
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
  return self.draught < other.draught - 0.3
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
  const look = 340
  const margin = 40 + 70 * p.draught

  let island = null
  for (const t of [0.35, 0.7, 1]) {
    const probe = world.terrain.probe({
      x: p.pos.x + Math.cos(desired) * look * t,
      y: p.pos.y + Math.sin(desired) * look * t,
    })
    if (!probe.island || probe.distance > margin) continue
    island = probe.island
    break
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

/**
 * Spend at a yard, then cast off.
 *
 * Buying is where a plan is actually expressed now, so the pilot mends itself
 * when badly knocked about and otherwise fits whatever on the shelf best suits
 * its archetype.
 */
export function shopAt(world: World) {
  const run = world.run
  const player = world.player
  const plan = archetypeFor(player.cls.id)

  // Mend first if she is in a bad way; a fast wreck is still a wreck.
  if (player.hull < 0.6 && run.coins >= run.repairPrice(player)) run.repair(player)

  // Then fit whatever suits the plan and can be paid for.
  for (let i = 0; i < 12; i++) {
    const affordable = run.stock
      .filter((part) => run.canAfford(part))
      .map((part) => ({ part, score: scoreCard(part, plan) }))
      .sort((a, b) => b.score - a.score)
    if (!affordable.length || affordable[0].score <= 0.5) break
    if (!run.buy(affordable[0].part, player)) break
  }

  // Keep a reserve for repairs rather than spending to the last coin.
  if (player.hull < 0.9 && run.coins >= run.repairPrice(player)) run.repair(player)

  run.castOff()
}

export interface RunResult {
  seed: number
  won: boolean
  seconds: number
  coins: number
  partsFitted: number
  yardVisits: number
  shipsSunk: number
  /** Share of the run spent with the keel on the bottom. Should be near zero. */
  agroundPercent: number
}

/** Play one run start to finish with no renderer attached. */
export function simulateRun(world: World, seed: number, maxSeconds = 500): RunResult {
  world.reset(seed)
  world.player.sailOrder = 1
  const dt = 1 / 60
  let steps = 0
  let aground = 0
  let visits = 0

  for (let i = 0; i < maxSeconds * 60; i++) {
    if (world.run.state === 'docked') {
      visits++
      shopAt(world)
      continue
    }
    if (world.run.state !== 'sailing') break
    world.drainSunk()
    autoPilot(world)
    world.step(dt)
    steps++
    if (world.player.aground) aground++
  }

  return {
    seed,
    won: world.run.state === 'won',
    seconds: Math.round(world.run.elapsed),
    coins: Math.round(world.run.totalCoins),
    partsFitted: [...world.run.taken.values()].reduce((a, b) => a + b, 0),
    yardVisits: visits,
    shipsSunk: world.run.shipsSunk,
    agroundPercent: +(100 * aground / Math.max(1, steps)).toFixed(2),
  }
}

/** Run a batch and summarise. The standard way to compare a tuning change. */
export function benchmark(world: World, seeds = 16, maxSeconds = 500) {
  const runs = Array.from({ length: seeds }, (_, i) => simulateRun(world, i + 1, maxSeconds))
  const times = runs.map((r) => r.seconds).sort((a, b) => a - b)
  const mean = (pick: (r: RunResult) => number) =>
    +(runs.reduce((sum, r) => sum + pick(r), 0) / runs.length).toFixed(2)
  return {
    seeds,
    winRate: `${Math.round((100 * runs.filter((r) => r.won).length) / runs.length)}%`,
    medianSeconds: times[Math.floor(times.length / 2)],
    range: `${times[0]}–${times[times.length - 1]}`,
    avgParts: mean((r) => r.partsFitted),
    avgYardVisits: mean((r) => r.yardVisits),
    avgCoins: mean((r) => r.coins),
    avgSunk: mean((r) => r.shipsSunk),
    avgAgroundPercent: mean((r) => r.agroundPercent),
    runs,
  }
}

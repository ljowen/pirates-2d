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

/** Rough value ordering, standing in for a player building toward a plan. */
const DRAFT_PRIORITY: Record<string, number> = {
  'heavier-shot': 10, 'powder-monkeys': 10, 'extra-gunport': 9,
  'ships-carpenter': 8, 'sailmaker': 7, 'trained-gunners': 6, 'long-nines': 6,
  'rakish-lines': 5, 'round-shot': 5, 'careened-hull': 4, 'taller-masts': 4,
  'veteran-topmen': 4, 'chain-shot': 3, 'grape-shot': 3, 'loot-hooks': 2,
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

  let want: number
  if (p.hull < 0.35 && target) {
    // Badly hurt: run downwind, the fastest way out of a fight.
    want = world.wind.to
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
  const off = angleDiff(want, world.wind.from)
  const noGo = (55 * Math.PI) / 180
  if (Math.abs(off) < noGo) want = world.wind.from + Math.sign(off || 1) * noGo

  want = avoidLand(world, want)

  world.steerInput = clamp(angleDiff(want, p.heading) * 1.8, -1, 1)
}

/**
 * Same tangent-grazing approach the enemy captains use. Without it the pilot
 * spent nearly a fifth of every run stuck on a beach, which made it measure
 * its own incompetence rather than the game's difficulty.
 */
function avoidLand(world: World, desired: number): number {
  const p = world.player
  const look = 340
  const margin = 40 + 70 * p.cls.draught

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

export interface RunResult {
  seed: number
  won: boolean
  seconds: number
  level: number
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

  for (let i = 0; i < maxSeconds * 60; i++) {
    if (world.run.state === 'drafting' && world.run.draft) {
      world.run.choose(pickCard(world.run.draft), world.player)
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
    level: world.run.level,
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
    avgLevel: mean((r) => r.level),
    avgSunk: mean((r) => r.shipsSunk),
    avgAgroundPercent: mean((r) => r.agroundPercent),
    runs,
  }
}

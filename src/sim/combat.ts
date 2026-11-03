import { T } from './tuning'
import type { Ship } from './ship'
import { angleDiff, type Vec2 } from '../core/math'

/**
 * Gunnery. The guns fire themselves the moment a target bears — the player's
 * job is to put the enemy on their beam and keep them there, which is the same
 * positioning problem the sailing model already poses, now with teeth.
 */

export interface Projectile {
  pos: Vec2
  vel: Vec2
  /** Seconds of flight remaining before the ball falls into the sea. */
  life: number
  ownerId: number
  ownerFaction: string
  /** Baked in at firing time so the firer's class sets the weight of shot. */
  damage: number
  /** Where this ball does its damage: hull, rigging, crew. */
  split: { hull: number; sails: number; crew: number }
}

export interface Splash {
  pos: Vec2
  life: number
  maxLife: number
  hit: boolean
  /** Who was struck, so audio can make a hit on your own hull land harder. */
  victimFaction?: string
}

/** Roughly where a ball lands when it strikes: mostly hull, some rigging, some crew. */
const HULL_SHARE = 0.62
const SAIL_SHARE = 0.24
const CREW_SHARE = 0.14

/**
 * Apply the firer's shot-type bias, then renormalise. Renormalising is what
 * keeps shot types a *choice* rather than a damage bonus: loading chain buys
 * rigging damage by giving up hull damage, it does not simply add.
 */
function normaliseSplit(ship: Ship) {
  const h = HULL_SHARE * ship.mods.shotHull
  const s = SAIL_SHARE * ship.mods.shotSails
  const c = CREW_SHARE * ship.mods.shotCrew
  const total = h + s + c
  return { hull: h / total, sails: s / total, crew: c / total }
}

const HIT_RADIUS = 23

/** Port battery is index 0, starboard 1. Sign is the lateral direction. */
export const BATTERY_SIDE = [-1, 1] as const

/**
 * Where a battery points: square out from the beam. A target has to be within
 * the arc for the guns to bear at all — no shooting over the bow.
 */
export function batteryBearing(ship: Ship, battery: 0 | 1): number {
  return ship.heading + BATTERY_SIDE[battery] * (Math.PI / 2)
}

/**
 * Lead the target by its own velocity, converging on the intercept point.
 *
 * Two iterations rather than one: with slow shot a single pass badly
 * under-leads, because the first estimate uses the flight time to where the
 * target *is* rather than where it will be. Gunners that cannot hit a moving
 * ship starve the whole progression loop.
 */
function firingSolution(from: Ship, target: Ship): { dir: number; dist: number } {
  const dx = target.pos.x - from.pos.x
  const dy = target.pos.y - from.pos.y
  const dist = Math.hypot(dx, dy)

  let px = target.pos.x
  let py = target.pos.y
  for (let i = 0; i < 2; i++) {
    const flight = Math.hypot(px - from.pos.x, py - from.pos.y) / T.ballSpeed
    px = target.pos.x + target.vel.x * flight
    py = target.pos.y + target.vel.y * flight
  }
  return { dir: Math.atan2(py - from.pos.y, px - from.pos.x), dist }
}

/**
 * Fire any battery that is loaded and has a target bearing. Returns the index
 * of each battery that spoke, so the renderer can throw smoke.
 */
export function updateGunnery(
  ship: Ship,
  enemies: Ship[],
  projectiles: Projectile[],
): void {
  if (ship.sunk) return
  const arc = (T.gunArcDegrees * Math.PI) / 180

  for (const battery of [0, 1] as const) {
    if (ship.reload[battery] > 0) continue

    const bearing = batteryBearing(ship, battery)

    // Pick the closest enemy this battery can actually bear on.
    let best: Ship | null = null
    let bestDist = Infinity
    let bestDir = 0
    for (const target of enemies) {
      if (target.sunk) continue
      const { dir, dist } = firingSolution(ship, target)
      if (dist > T.gunRange * ship.cls.range * ship.mods.range || dist > bestDist) continue
      if (Math.abs(angleDiff(dir, bearing)) > arc) continue
      best = target
      bestDist = dist
      bestDir = dir
    }
    if (!best) continue

    // Accuracy falls off with range, so closing is rewarded.
    const range = T.gunRange * ship.cls.range * ship.mods.range
    const spread = T.ballSpread * ship.mods.spread * (0.45 + 1.1 * (bestDist / range))
    const guns = Math.max(
      1,
      Math.round(T.gunsPerBroadside * ship.cls.guns) + ship.mods.extraGuns,
    )
    for (let i = 0; i < guns; i++) {
      // Spread the volley evenly across the arc rather than randomly, so a
      // broadside reads as a wall of shot instead of a shotgun blast.
      const offset = guns === 1 ? 0 : (i / (guns - 1) - 0.5) * 2 * spread
      const a = bestDir + offset
      projectiles.push({
        pos: { ...ship.pos },
        vel: { x: Math.cos(a) * T.ballSpeed, y: Math.sin(a) * T.ballSpeed },
        life: range / T.ballSpeed,
        ownerId: ship.id,
        ownerFaction: ship.faction,
        damage: T.damagePerBall * ship.cls.damage * ship.mods.damage,
        // Shot type travels with the ball, so what you loaded is what lands.
        split: normaliseSplit(ship),
      })
    }

    ship.reload[battery] = T.gunReload * ship.cls.reload * ship.mods.reload
    ship.sinceFired[battery] = 0
    ship.shotCount[battery]++
  }
}

export interface CombatEvents {
  splashes: Splash[]
  /** Ships that went down this step. */
  sunk: Ship[]
}

/** Advance every ball and resolve hits. */
export function stepProjectiles(
  projectiles: Projectile[],
  ships: Ship[],
  dt: number,
  events: CombatEvents,
): Projectile[] {
  const alive: Projectile[] = []

  for (const p of projectiles) {
    p.life -= dt
    p.pos.x += p.vel.x * dt
    p.pos.y += p.vel.y * dt

    if (p.life <= 0) {
      events.splashes.push({ pos: { ...p.pos }, life: 0.5, maxLife: 0.5, hit: false })
      continue
    }

    let struck = false
    for (const ship of ships) {
      if (ship.sunk || ship.id === p.ownerId) continue
      // Only shot from the other side does damage; a melee between enemies
      // should not dissolve into friendly fire.
      if (ship.faction === p.ownerFaction) continue
      if (Math.hypot(ship.pos.x - p.pos.x, ship.pos.y - p.pos.y) > HIT_RADIUS) continue

      const d = p.damage
      const wentDown = ship.applyDamage(
        d * p.split.hull, d * p.split.sails, d * p.split.crew,
      )
      events.splashes.push({
        pos: { ...p.pos }, life: 0.35, maxLife: 0.35, hit: true, victimFaction: ship.faction,
      })
      if (wentDown) events.sunk.push(ship)
      struck = true
      break
    }

    if (!struck) alive.push(p)
  }

  return alive
}

export function stepSplashes(splashes: Splash[], dt: number): Splash[] {
  const alive: Splash[] = []
  for (const s of splashes) {
    s.life -= dt
    if (s.life > 0) alive.push(s)
  }
  return alive
}

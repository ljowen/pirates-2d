import { T } from './tuning'
import type { Ship } from './ship'
import type { Wind } from './wind'
import type { Vec2 } from '../core/math'

/**
 * Plunder left behind by a wreck. It drifts downwind rather than sitting
 * still, which matters more than it sounds: a prize to leeward is free, and a
 * prize to windward costs you a beat to go and fetch. The pickup is where the
 * sailing model and the progression loop meet.
 */
export interface Plunder {
  pos: Vec2
  vel: Vec2
  value: number
  /** Seconds before it sinks out of reach. */
  life: number
  maxLife: number
  /** Set once the magnet has it, purely so the renderer can show the pull. */
  drawn: boolean
}

export function dropPlunder(list: Plunder[], at: Vec2, value: number, rand: () => number) {
  // Split a wreck's worth into a few pieces so collecting reads as a sweep
  // rather than a single tap.
  const pieces = Math.max(1, Math.min(5, Math.round(value / 2)))
  const each = value / pieces
  for (let i = 0; i < pieces; i++) {
    const a = rand() * Math.PI * 2
    const speed = 20 + rand() * 45
    list.push({
      pos: { x: at.x, y: at.y },
      vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      value: each,
      life: T.plunderLifetime,
      maxLife: T.plunderLifetime,
      drawn: false,
    })
  }
}

/** Returns the total value collected this step. */
export function stepPlunder(
  list: Plunder[],
  player: Ship,
  wind: Wind,
  dt: number,
): { remaining: Plunder[]; collected: number } {
  const remaining: Plunder[] = []
  let collected = 0

  const magnet = T.plunderMagnetRadius * player.mods.pickupRadius
  const grab = T.plunderPickupRadius * player.mods.pickupRadius
  const driftX = Math.cos(wind.to) * 14 * wind.strength
  const driftY = Math.sin(wind.to) * 14 * wind.strength

  for (const p of list) {
    p.life -= dt
    if (p.life <= 0) continue

    const dx = player.pos.x - p.pos.x
    const dy = player.pos.y - p.pos.y
    const dist = Math.hypot(dx, dy)

    if (dist <= grab && !player.sunk) {
      collected += p.value
      continue
    }

    if (dist <= magnet && !player.sunk) {
      // Accelerate toward the ship, faster the closer it gets.
      const pull = T.plunderMagnetPull * (1 - dist / magnet) + 60
      p.vel.x += (dx / dist) * pull * dt
      p.vel.y += (dy / dist) * pull * dt
      p.drawn = true
    } else {
      p.drawn = false
      // Otherwise it just rides the surface downwind.
      p.vel.x += (driftX - p.vel.x) * 0.6 * dt
      p.vel.y += (driftY - p.vel.y) * 0.6 * dt
    }

    p.vel.x *= 1 - 0.8 * dt
    p.vel.y *= 1 - 0.8 * dt
    p.pos.x += p.vel.x * dt
    p.pos.y += p.vel.y * dt
    remaining.push(p)
  }

  return { remaining, collected }
}

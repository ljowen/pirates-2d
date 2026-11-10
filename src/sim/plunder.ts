import { T } from './tuning'
import type { Ship } from './ship'
import type { WindSample } from './wind'
import type { Vec2 } from '../core/math'

/**
 * What a wreck leaves floating. Two kinds, because they answer two different
 * questions:
 *
 * - **Coin** is progress. It fills the experience bar and buys the next draft.
 * - **Timber** is survival. Spare baulks and planking the carpenter can work
 *   into a shot hole, so it mends the hull.
 *
 * Keeping them apart is the whole point. A single pickup that did both made
 * every wreck worth the same beat to windward; two make it a question — level
 * up, or stay afloat — and the wind decides what each answer costs, because
 * both drift downwind from where she went down.
 */
export type FlotsamKind = 'coin' | 'timber'

export interface Plunder {
  pos: Vec2
  vel: Vec2
  kind: FlotsamKind
  /** Coin: plunder value. Timber: fraction of the hull it mends. */
  value: number
  /** Seconds before it sinks out of reach. */
  life: number
  maxLife: number
  /** Set once the magnet has it, purely so the renderer can show the pull. */
  drawn: boolean
}

/** One wreck's worth of flotsam: her plunder in coin, her timbers alongside. */
export function dropPlunder(list: Plunder[], at: Vec2, value: number, rand: () => number) {
  const scatter = (kind: FlotsamKind, pieces: number, each: number) => {
    for (let i = 0; i < pieces; i++) {
      const a = rand() * Math.PI * 2
      const speed = 20 + rand() * 45
      list.push({
        pos: { x: at.x, y: at.y },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
        kind,
        value: each,
        life: T.plunderLifetime,
        maxLife: T.plunderLifetime,
        drawn: false,
      })
    }
  }

  // Split a wreck's worth into a few pieces so collecting reads as a sweep
  // rather than a single tap.
  const coins = Math.max(1, Math.min(5, Math.round(value / 2)))
  scatter('coin', coins, value / coins)

  // Timber scales with the hull that went down, so a Brigantine is worth
  // chasing when you are hurt and a Pinnace barely covers a scratch.
  const hull = value * T.wreckTimber
  if (hull <= 0) return
  // Sized so a baulk is always a visible bite out of the damage, never a
  // crumb: pieces are added rather than shrunk as the prize gets richer.
  const baulks = Math.max(1, Math.min(3, Math.round(hull / 0.07)))
  scatter('timber', baulks, hull / baulks)
}

/** One piece coming aboard, so the renderer can say so over the ship. */
export interface Pickup {
  pos: Vec2
  kind: FlotsamKind
  value: number
}

/** Returns the coin taken aboard this step, and the hull the timber mends. */
export function stepPlunder(
  list: Plunder[],
  player: Ship,
  windAt: (p: Vec2) => WindSample,
  dt: number,
): { remaining: Plunder[]; collected: number; mended: number; taken: Pickup[] } {
  const remaining: Plunder[] = []
  const taken: Pickup[] = []
  let collected = 0
  let mended = 0

  const magnet = T.plunderMagnetRadius * player.mods.pickupRadius
  const grab = T.plunderPickupRadius * player.mods.pickupRadius

  for (const p of list) {
    p.life -= dt
    if (p.life <= 0) continue

    const dx = player.pos.x - p.pos.x
    const dy = player.pos.y - p.pos.y
    const dist = Math.hypot(dx, dy)

    if (dist <= grab && !player.sunk) {
      if (p.kind === 'timber') mended += p.value
      else collected += p.value
      taken.push({ pos: { ...p.pos }, kind: p.kind, value: p.value })
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
      // Otherwise it just rides the surface downwind — on the wind where the
      // piece actually floats, which may differ from the wind at the ship.
      const local = windAt(p.pos)
      const driftX = Math.cos(local.to) * 14 * local.strength
      const driftY = Math.sin(local.to) * 14 * local.strength
      p.vel.x += (driftX - p.vel.x) * 0.6 * dt
      p.vel.y += (driftY - p.vel.y) * 0.6 * dt
    }

    p.vel.x *= 1 - 0.8 * dt
    p.vel.y *= 1 - 0.8 * dt
    p.pos.x += p.vel.x * dt
    p.pos.y += p.vel.y * dt
    remaining.push(p)
  }

  return { remaining, collected, mended, taken }
}

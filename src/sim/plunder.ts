import { T } from './tuning'
import type { Ship } from './ship'
import type { WindSample } from './wind'
import type { Vec2 } from '../core/math'

/**
 * What a wreck leaves floating.
 *
 * Coin, and only coin: it fills the experience bar and buys the next draft.
 *
 * Wrecks used to shed **timber** as well, which mended the hull — a second
 * kind of flotsam so that every wreck asked "level up, or stay afloat?". It
 * worked, and it was removed anyway, because between timber and a baseline
 * repair rate the hull quietly healed faster than the sea could hurt it: whole
 * runs went by without the player ever feeling in danger until a Galleon
 * arrived. Sustain now comes from one place only — heaving to — so the
 * question is no longer which flotsam to chase but whether you can afford to
 * stop at all. The kind is kept as a type so the seam for a second flotsam
 * remains obvious.
 */
export type FlotsamKind = 'coin'

export interface Plunder {
  pos: Vec2
  vel: Vec2
  kind: FlotsamKind
  /** Plunder value. */
  value: number
  /** Seconds before it sinks out of reach. */
  life: number
  maxLife: number
  /** Set once the magnet has it, purely so the renderer can show the pull. */
  drawn: boolean
}

/** One wreck's worth of flotsam. */
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
}

/** One piece coming aboard, so the renderer can say so over the ship. */
export interface Pickup {
  pos: Vec2
  kind: FlotsamKind
  value: number
}

/** Returns the coin taken aboard this step. */
export function stepPlunder(
  list: Plunder[],
  player: Ship,
  windAt: (p: Vec2) => WindSample,
  dt: number,
): { remaining: Plunder[]; collected: number; taken: Pickup[] } {
  const remaining: Plunder[] = []
  const taken: Pickup[] = []
  let collected = 0

  const magnet = T.plunderMagnetRadius * player.mods.pickupRadius
  const grab = T.plunderPickupRadius * player.mods.pickupRadius

  for (const p of list) {
    p.life -= dt
    if (p.life <= 0) continue

    const dx = player.pos.x - p.pos.x
    const dy = player.pos.y - p.pos.y
    const dist = Math.hypot(dx, dy)

    if (dist <= grab && !player.sunk) {
      collected += p.value
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

  return { remaining, collected, taken }
}

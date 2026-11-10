import type { World } from '../sim/world'
import type { FlotsamKind } from '../sim/plunder'
import type { Camera } from './camera'

interface Floater {
  /** World position. It rises in *world* space, so it stays over the water. */
  x: number
  y: number
  kind: FlotsamKind
  value: number
  life: number
  maxLife: number
}

/** How long a number hangs about, and how far it drifts up while it does. */
const LIFE = 1.1
const RISE = 42
/** Pieces this close together, this soon after one another, are one pickup. */
const MERGE_RADIUS = 70
const MERGE_WINDOW = 0.35

/**
 * The little numbers that pop when something comes aboard.
 *
 * Plunder is swept up by a magnet from nearly two hundred units out, which
 * means it is routinely collected off-screen-ish and behind the ship, with no
 * feedback beyond a bar somewhere else moving slightly. Two different things
 * are being picked up now — coin and timber — and which one you just got is
 * the whole question when you are hurt, so it has to be said at the moment it
 * happens and at the place it happens.
 *
 * Drawn in world space on the instrument canvas rather than as a Pixi object:
 * it is text, and text is far easier in Canvas2D, which is the same reason
 * every other instrument lives here.
 */
export class PickupText {
  private readonly items: Floater[] = []

  /** Drain the simulation's pickups and advance what is already on screen. */
  update(world: World, dt: number) {
    for (const p of world.drainPickups()) {
      // A wreck's worth arrives as several pieces over several frames. Shown
      // separately that is a cloud of "+1.2"s climbing over each other; merged
      // it is one honest number for one act of collecting.
      const near = this.items.find(
        (f) =>
          f.kind === p.kind &&
          f.maxLife - f.life < MERGE_WINDOW &&
          Math.hypot(f.x - p.pos.x, f.y - p.pos.y) < MERGE_RADIUS,
      )
      if (near) {
        near.value += p.value
        // Give the merged number its moment back, so a steady trickle of
        // pieces reads as one growing total rather than a fading one.
        near.life = Math.max(near.life, LIFE * 0.8)
        continue
      }
      this.items.push({
        x: p.pos.x, y: p.pos.y, kind: p.kind, value: p.value,
        life: LIFE, maxLife: LIFE,
      })
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i]
      f.life -= dt
      if (f.life <= 0) this.items.splice(i, 1)
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera) {
    if (this.items.length === 0) return

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 15px ui-monospace, monospace'

    for (const f of this.items) {
      const t = 1 - f.life / f.maxLife
      // Rise quickly at first and ease off, which reads as something thrown
      // up rather than something sliding.
      const climb = RISE * (1 - (1 - t) * (1 - t))
      const screen = camera.worldToScreen({ x: f.x, y: f.y - climb })
      // Hold full opacity for the first half, then fade.
      const alpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2

      const coin = f.kind === 'coin'
      const text = coin
        ? `+${f.value < 10 ? f.value.toFixed(1) : f.value.toFixed(0)}`
        : `+${Math.round(f.value * 100)}% hull`

      // A dark edge, because these land on open water, on pale shoals and on
      // green islands, and nothing readable survives all three unaided.
      ctx.lineWidth = 3
      ctx.strokeStyle = `rgba(4,14,24,${0.65 * alpha})`
      ctx.strokeText(text, screen.x, screen.y)
      ctx.fillStyle = coin
        ? `rgba(240,193,75,${alpha})`
        : `rgba(127,224,160,${alpha})`
      ctx.fillText(text, screen.x, screen.y)
    }
    ctx.restore()
  }

  clear() { this.items.length = 0 }
}
